// netlify/functions/logout.js
// 解除本设备登录：删除 email_sessions 里对应 token 的行（仅影响当前设备）。
//
// 需 Netlify 环境变量：
//   SUPABASE_URL              （缺省回退到下方公开值）
//   SUPABASE_SERVICE_ROLE_KEY （服务端专用密钥，绝不可放前端）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    return {ok: resp.ok, status: resp.status, body};
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 200);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405);
    try {
        let token = '';
        try {
            const parsed = JSON.parse(event.body || '{}');
            token = parsed.token || '';
        } catch (e) { /* 忽略 */ }
        if (!token) return cors({ok: true}); // 无 token 直接视为已登出
        await sbFetch(`email_sessions?token=eq.${encodeURIComponent(token)}`, {
            method: 'DELETE'
        });
        return cors({ok: true});
    } catch (e) {
        console.error(e);
        return cors({error: String(e && e.message ? e.message : e)}, 500);
    }
};
