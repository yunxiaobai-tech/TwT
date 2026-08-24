// netlify/functions/avatar.js —— 头像读写
// GET  → 返回当前用户的 avatar_url（来自 email_accounts）
// POST → 通过 set_avatar RPC 同步写 email_accounts + usernames
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');
const {getTokenDevice} = require('./_lib/auth');

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204, event);
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return cors({error: 'method_not_allowed'}, 405, event);
    }
    try {
        let token = '';
        if (event.httpMethod === 'POST') {
            const payload = JSON.parse(event.body || '{}');
            token = (payload.token || '').toString();
        } else {
            const qs = event.queryStringParameters || {};
            token = (qs.token || '').toString();
        }
        if (!token) return cors({error: 'unauthorized'}, 401, event);

        if (event.httpMethod === 'GET') {
            const deviceId = await getTokenDevice(token);
            if (!deviceId) return cors({error: 'unauthorized'}, 401, event);
            const rows = await sbFetch(
                `usernames?device_id=eq.${encodeURIComponent(deviceId)}&select=avatar_url`,
                {method: 'GET'}
            );
            const rec = (Array.isArray(rows) && rows[0]) || null;
            return cors({ok: true, avatar_url: (rec && rec.avatar_url) || null}, 200, event);
        }

        // POST：更新头像
        const payload = JSON.parse(event.body || '{}');
        const avatarUrl = (payload.avatar_url || '').toString();
        if (!avatarUrl) return cors({error: 'missing_avatar'}, 400, event);
        if (avatarUrl.length > MAX_AVATAR_BYTES) return cors({error: 'avatar_too_large'}, 413, event);
        if (!/^data:image\/(png|jpe?g|gif|webp);base64,/.test(avatarUrl) && !/^https:\/\//.test(avatarUrl)) {
            return cors({error: 'invalid_avatar_format'}, 400, event);
        }
        try {
            await sbFetch('rpc/set_avatar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({p_token: token, p_avatar_url: avatarUrl})
            });
        } catch (e) {
            if (e.status === 500 && /unauthorized/.test(String(e.message))) {
                return cors({error: 'unauthorized'}, 401, event);
            }
            throw e;
        }
        return cors({ok: true, avatar_url: avatarUrl}, 200, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
