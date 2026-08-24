// netlify/functions/like-comment.js —— 点赞服务端代理
// 前端不再直连 Supabase RPC；所有写操作统一走 Netlify 函数。
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
        const liked = !!body.liked;
        if (!id) return cors({error: 'missing_id'}, 400, event);

        await sbFetch('rpc/set_like', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({p_id: id, p_device: device, p_liked: liked})
        });
        return cors({ok: true}, 200, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
