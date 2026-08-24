// netlify/functions/admin.js —— 管理员操作统一入口
// 动作：deleteFeedback / markResolved / unmarkResolved / getMyRole
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');
const {emailFromToken, isAdminEmail, requireAdmin} = require('./_lib/admin-auth');

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204, event);
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return cors({error: 'method_not_allowed'}, 405, event);
    }

    let token = '';
    let action = '';
    let payload = {};

    if (event.httpMethod === 'GET') {
        const qs = event.queryStringParameters || {};
        token = (qs.token || '').toString();
        action = 'getMyRole';
    } else {
        payload = JSON.parse(event.body || '{}');
        token = (payload.token || '').toString();
        action = (payload.action || '').toString();
    }

    if (action === 'getMyRole') {
        const email = await emailFromToken(token);
        if (!email) return cors({ok: true, role: 'guest'}, 200, event);
        const admin = await isAdminEmail(email);
        return cors({ok: true, role: admin ? 'admin' : 'user', email}, 200, event);
    }

    const adminEmail = await requireAdmin(token);
    if (!adminEmail) return cors({error: 'forbidden'}, 403, event);

    const id = (payload.id || '').toString();
    if (!id) return cors({error: 'missing_id'}, 400, event);

    if (action === 'deleteFeedback') {
        await sbFetch(`feedback?id=eq.${encodeURIComponent(id)}`, {method: 'DELETE'});
        return cors({ok: true, action, id}, 200, event);
    }

    if (action === 'markResolved' || action === 'unmarkResolved') {
        const status = action === 'markResolved' ? 'resolved' : 'normal';
        await sbFetch(
            `feedback?id=eq.${encodeURIComponent(id)}`,
            {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status})}
        );
        return cors({ok: true, action, id, status}, 200, event);
    }

    return cors({error: 'unknown_action'}, 400, event);
};
