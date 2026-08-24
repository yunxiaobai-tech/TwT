// netlify/functions/register.js —— 邮箱注册
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
        const password = (body.password || '').toString();
        const username = (body.username || '').toString().trim();
        const deviceId = (body.device_id || '').toString().slice(0, 120);

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return cors({error: 'invalid_email'}, 400, event);
        if (!code || !/^\d{6}$/.test(code)) return cors({error: 'invalid_code_format'}, 400, event);
        if (password.length < 6) return cors({error: 'password_too_short'}, 400, event);
        if (!username || username.length > 20) return cors({error: 'invalid_username'}, 400, event);
        if (!deviceId) return cors({error: 'missing_device_id'}, 400, event);

        // 校验验证码
        const rows = await sbFetch(
            `email_codes?email=eq.${encodeURIComponent(email)}&select=*`,
            {method: 'GET'}
        );
        const rec = (Array.isArray(rows) && rows[0]) || null;
        if (!rec) return cors({error: 'code_not_found'}, 400, event);
        if (new Date(rec.expires_at).getTime() < Date.now()) return cors({error: 'expired'}, 400, event);
        if (rec.attempts >= MAX_ATTEMPTS) return cors({error: 'max_attempts'}, 400, event);
        if (rec.code !== code) {
            const newAttempts = rec.attempts + 1;
            await sbFetch(
                `email_codes?email=eq.${encodeURIComponent(email)}`,
                {method: 'PATCH', headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                 body: JSON.stringify({attempts: newAttempts})}
            );
            return cors({error: 'invalid_code', attempts_left: Math.max(0, MAX_ATTEMPTS - newAttempts)}, 400, event);
        }

        // 验证码通过：检查用户名是否已被占用
        const nameRows = await sbFetch(
            `usernames?name=eq.${encodeURIComponent(username)}&select=device_id`,
            {method: 'GET'}
        );
        if (Array.isArray(nameRows) && nameRows.length > 0) {
            return cors({error: 'username_taken'}, 409, event);
        }

        // 存储密码哈希 + 建账户（原子性保证：先查用户名冲突，再建账户）
        const passwordHash = await hashPassword(password);
        let accountId;
        try {
            const accountRows = await sbFetch('email_accounts', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                body: JSON.stringify({email, password_hash: passwordHash, verified: true, created_at: new Date().toISOString()})
            });
            accountId = (Array.isArray(accountRows) && accountRows[0] && accountRows[0].id) || null;
        } catch (e) {
            if (e.status === 409) return cors({error: 'email_exists'}, 409, event);
            throw e;
        }

        // 建本机昵称（带 device_secret，前端不可读）
        const deviceSecret = crypto.randomBytes(16).toString('hex');
        try {
            await sbFetch('usernames', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                body: JSON.stringify({device_id: deviceId, name: username, device_secret: deviceSecret,
                    created_at: new Date().toISOString(), name_updated_at: new Date().toISOString()})
            });
        } catch (e) {
            // 唯一约束冲突（并发场景）：回滚 email_accounts，返回冲突错误
            if (e.status === 409 || /unique/i.test(String(e.message))) {
                // 删除刚创建的 email_account 行，保持数据一致
                if (accountId) {
                    try {
                        await sbFetch(`email_accounts?id=eq.${encodeURIComponent(accountId)}`, {method: 'DELETE'});
                    } catch (_) { /* 回滚失败仅记录日志 */ }
                }
                return cors({error: 'username_taken'}, 409, event);
            }
            throw e;
        }

        // 标记验证码已用
        await sbFetch(
            `email_codes?email=eq.${encodeURIComponent(email)}`,
            {method: 'PATCH', headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
             body: JSON.stringify({verified: true, attempts: rec.attempts + 1})}
        );

        // 生成登录态
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await sbFetch('email_sessions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
            body: JSON.stringify({token, email, device_id: deviceId, created_at: new Date().toISOString(), expires_at: expiresAt.toISOString()})
        });

        return cors({ok: true, token, email, expires_at: expiresAt.toISOString()}, 200, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
