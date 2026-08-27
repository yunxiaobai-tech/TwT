// netlify/functions/login.js —— 邮箱登录
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY（用于安全提醒）

const crypto = require('crypto');
const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';

function verifyPassword (pw, stored) {
    return new Promise((resolve, reject) => {
        const parts = (stored || '').split('$');
        if (parts.length !== 3 || parts[0] !== 'scrypt') return resolve(false);
        crypto.scrypt(pw, parts[1], 64, (err, derived) => {
            if (err) return reject(err);
            resolve(derived.toString('hex') === parts[2]);
        });
    });
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204, event);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405, event);
    try {
        const body = JSON.parse(event.body || '{}');
        const email = (body.email || '').toString().trim().toLowerCase();
        const password = (body.password || '').toString();
        const deviceId = (body.device_id || '').toString().slice(0, 120);

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return cors({error: 'invalid_email'}, 400, event);
        if (!password) return cors({error: 'missing_password'}, 400, event);
        if (!deviceId) return cors({error: 'missing_device_id'}, 400, event);

        const rows = await sbFetch(
            `email_accounts?email=eq.${encodeURIComponent(email)}&select=email,password_hash,verified`,
            {method: 'GET'}
        );
        const rec = (Array.isArray(rows) && rows[0]) || null;
        if (!rec) return cors({error: 'invalid_credentials'}, 401, event);
        if (!rec.verified) return cors({error: 'not_verified'}, 403, event);

        const ok = await verifyPassword(password, rec.password_hash);
        if (!ok) return cors({error: 'invalid_credentials'}, 401, event);

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await sbFetch('email_sessions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
            body: JSON.stringify({token, email, device_id: deviceId, created_at: new Date().toISOString(), expires_at: expiresAt.toISOString()})
        });

        // 4. 检测多设备：查询该邮箱下是否存在其他设备已登录（排除本次 device_id）
        const existingSessions = await sbFetch(
            `email_sessions?email=eq.${encodeURIComponent(email)}&device_id=neq.${encodeURIComponent(device_id)}&expires_at=gte.${new Date().toISOString()}&select=device_id,created_at`,
            {method: 'GET'}
        );
        const hasOtherDevice = Array.isArray(existingSessions) && existingSessions.length > 0;

        if (hasOtherDevice) {
            // 获取请求 IP（从 headers 中提取）
            const ip = (event.headers && (event.headers['x-forwarded-for'] || event.headers['x-real-ip'])) || '';
            // 异步发送安全提醒（不阻塞响应）
            try {
                await fetch(`${SUPABASE_URL}/.netlify/functions/alert-login`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({email, device_id, ip}),
                    signal: AbortSignal.timeout(8000)
                }).catch(() => {});
            } catch (e) { /* 静默失败，不影响登录流程 */ }
        }

        // 5. 记录登录日志（供后续查询和限流用）
        await sbFetch('device_login_logs', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
            body: JSON.stringify({email, device_id, ip_address: ip, logged_at: new Date().toISOString()})
        });

        return cors({ok: true, token, email, expires_at: expiresAt.toISOString()}, 200, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
