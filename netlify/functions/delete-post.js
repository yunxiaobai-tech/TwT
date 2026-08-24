// netlify/functions/delete-post.js —— 删除帖子服务端代理
// 校验 token → device → owner_secret 匹配，防越权删除。
//
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');
const {getTokenDevice} = require('./_lib/auth');

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204, event);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405, event);
    try {
        const body = JSON.parse(event.body || '{}');
        const token = (body.token || '').toString().slice(0, 200);
        if (!token) return cors({error: 'auth_required'}, 401, event);

        const device = await getTokenDevice(token);
        if (!device) return cors({error: 'auth_invalid'}, 401, event);

        const id = (body.id || '').toString();
        const ownerSecret = (body.owner_secret || '').toString();
        if (!id) return cors({error: 'missing_id'}, 400, event);

        // 调用 SQL RPC 删除（函数内部已校验 owner_secret 与帖子归属是否匹配）
        await sbFetch('rpc/delete_own_feedback', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({p_id: id, p_secret: ownerSecret})
        });
        return cors({ok: true}, 200, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
