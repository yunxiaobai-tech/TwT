// netlify/functions/reset-password.js —— 通过验证码重置密码
// 验证流程：邮箱 → 验证码 → 新密码（≥6位）→ 更新 email_accounts.password_hash
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');
const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');

const MAX_ATTEMPTS = 3;

function hashPassword (pw) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(pw, salt, 64, (err, derived) => {
            if (err) return reject(err);
            resolve(`scrypt$${salt}$${derived.toString('hex')}`);
        });
    });
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204, event);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405, event);
    try {
        const body = JSON.parse(event.body || '{}');
        const email = (body.email || '').toString().trim().toLowerCase();
        const code = (body.code || '').toString().trim();
        const newPassword = (body.new_password || '').toString();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return cors({error: 'invalid_email'}, 400, event);
        }
        if (!code || !/^\d{6}$/.test(code)) {
            return cors({error: 'invalid_code_format'}, 400, event);
        }
        if (newPassword.length < 6) {
            return cors({error: 'password_too_short'}, 400, event);
        }

        // 1. 查询账户是否存在
        const accountRows = await sbFetch(
            `email_accounts?email=eq.${encodeURIComponent(email)}&select=id,password_hash,verified`,
            {method: 'GET'}
        );
        const account = (Array.isArray(accountRows) && accountRows[0]) || null;
        if (!account) {
            return cors({error: 'email_not_found'}, 404, event);
        }
        if (!account.verified) {
            return cors({error: 'not_verified'}, 403, event);
        }

        // 2. 校验验证码
        const codeRows = await sbFetch(
            `email_codes?email=eq.${encodeURIComponent(email)}&select=*`,
            {method: 'GET'}
        );
        const codeRec = (Array.isArray(codeRows) && codeRows[0]) || null;
        if (!codeRec) {
            return cors({error: 'code_not_found'}, 400, event);
        }
        if (new Date(codeRec.expires_at).getTime() < Date.now()) {
            return cors({error: 'expired'}, 400, event);
        }
        if (codeRec.attempts >= MAX_ATTEMPTS) {
            return cors({error: 'max_attempts'}, 400, event);
        }
        if (codeRec.code !== code) {
            const newAttempts = codeRec.attempts + 1;
            await sbFetch(
                `email_codes?email=eq.${encodeURIComponent(email)}`,
                {method: 'PATCH', headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                 body: JSON.stringify({attempts: newAttempts})}
            );
            return cors({error: 'invalid_code', attempts_left: Math.max(0, MAX_ATTEMPTS - newAttempts)}, 400, event);
        }

        // 3. 更新密码
        const newHash = await hashPassword(newPassword);
        await sbFetch(
            `email_accounts?id=eq.${encodeURIComponent(account.id)}`,
            {method: 'PATCH', headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
             body: JSON.stringify({password_hash: newHash})}
        );

        // 4. 标记验证码已使用
        await sbFetch(
            `email_codes?email=eq.${encodeURIComponent(email)}`,
            {method: 'PATCH', headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
             body: JSON.stringify({verified: true, attempts: codeRec.attempts + 1})}
        );

        // 5. 踢出所有设备的登录态（安全：密码已变）
        await sbFetch(
            `email_sessions?email=eq.${encodeURIComponent(email)}`,
            {method: 'DELETE'}
        );

        return cors({ok: true}, 200, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
