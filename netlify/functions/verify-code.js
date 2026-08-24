// netlify/functions/verify-code.js
// 邮箱验证码登录：校验用户提交的 6 位验证码，成功后创建 session token 并返回。
// 错误 3 次或过期后要求重发。
//
// 需 Netlify 环境变量：
//   SUPABASE_URL               （项目地址，缺省回退到下方公开值）
//   SUPABASE_SERVICE_ROLE_KEY  （服务端专用密钥，绝不可放入前端）

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SESSION_TTL_DAYS = 30; // 登录态 30 天有效
const MAX_ATTEMPTS = 3;

function cors (body, status = 200) {
    return {
        statusCode: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

// 用 service_role 调 Supabase REST（绕过 RLS，属于服务端内部操作）
async function sbFetch (path, options) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, options, {
        headers: Object.assign({
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`
        }, options.headers || {})
    }));
    const text = await resp.text();
    let body = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch (e) {
            body = null;
        }
    }
    if (!resp.ok) {
        const err = new Error((body && (body.message || body.error_description)) ||
            text.slice(0, 200) || `HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return body;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405);
    if (!SERVICE_ROLE_KEY) return cors({error: 'server_missing_db_key'}, 500);

    try {
        const body = JSON.parse(event.body || '{}');
        const email = (body.email || '').toString().trim().toLowerCase();
        const code = (body.code || '').toString().trim();
        const deviceId = (body.device_id || '').toString().slice(0, 120);

        if (!email || !code || !deviceId) {
            return cors({error: 'missing_fields'}, 400);
        }

        const rows = await sbFetch(
            `email_codes?email=eq.${encodeURIComponent(email)}&select=*`,
            {method: 'GET'}
        );
        const rec = (Array.isArray(rows) && rows[0]) || null;
        if (!rec) {
            return cors({error: 'code_not_found'}, 400);
        }

        // 已过期
        if (new Date(rec.expires_at).getTime() < Date.now()) {
            return cors({error: 'expired'}, 400);
        }

        // 已超尝试次数
        if (rec.attempts >= MAX_ATTEMPTS) {
            return cors({error: 'max_attempts'}, 400);
        }

        // 验证码不匹配：增加尝试次数
        if (rec.code !== code) {
            const newAttempts = rec.attempts + 1;
            await sbFetch(
                `email_codes?email=eq.${encodeURIComponent(email)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({attempts: newAttempts})
                }
            );
            return cors({
                error: 'invalid_code',
                attempts_left: Math.max(0, MAX_ATTEMPTS - newAttempts)
            }, 400);
        }

        // 校验通过：生成 session token
        const token = crypto.randomBytes(32).toString('hex');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

        await sbFetch('email_sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                token: token,
                email: email,
                device_id: deviceId,
                created_at: now.toISOString(),
                expires_at: expiresAt.toISOString()
            })
        });

        // 标记验证码已使用
        await sbFetch(
            `email_codes?email=eq.${encodeURIComponent(email)}`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({verified: true, attempts: rec.attempts + 1})
            }
        );

        return cors({
            ok: true,
            token: token,
            email: email,
            expires_at: expiresAt.toISOString()
        });
    } catch (e) {
        console.error(e);
        return cors({error: String(e && e.message ? e.message : e)}, 500);
    }
};
