// netlify/functions/_lib/db.js —— 共享数据库访问层
// 所有服务端函数统一使用本模块访问 Supabase，避免重复代码。
// 要求 Netlify 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * 用 service_role 调 Supabase REST（绕过 RLS，服务端内部操作）。
 */
module.exports.sbFetch = async function sbFetch (path, options) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, options, {
        headers: Object.assign({
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`
        }, (options && options.headers) || {})
    }));
    const text = await resp.text();
    let body = null;
    if (text) {
        try { body = JSON.parse(text); } catch (e) { body = null; }
    }
    if (!resp.ok) {
        const err = new Error((body && (body.message || body.error_description)) ||
            text.slice(0, 200) || `HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return body;
};
