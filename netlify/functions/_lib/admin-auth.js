// netlify/functions/_lib/admin-auth.js —— 管理员鉴权共享模块（不部署为独立函数）
// 作用：把「token → session → email → role === 'admin'」的校验链路收敛到一处，
// 被 admin.js（管理员操作）及其他管理类函数复用。
//
// 设计要点：
// - 单独查 email_accounts.role，不依赖前端传输，前端给的任何 role 字段都不可当凭证；
// - 只在服务端使用 service_role key，anon 无法读取 email_accounts.role。
//
// 导出：
//   emailFromToken(token)  用 token 换当前登录邮箱（无效/过期返回 null）
//   isAdminEmail(email)    该邮箱是否为 admin 角色
//   requireAdmin(token)    串起来用：合法管理员返回 email，否则返回 null

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch (path, options) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, options, {
        headers: Object.assign({
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`
        }, (options && options.headers) || {})
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

// 用登录 token 换取 email；无效/过期返回 null
async function emailFromToken (token) {
    if (!token) return null;
    const rows = await sbFetch(
        `email_sessions?token=eq.${encodeURIComponent(token)}&select=email,expires_at`,
        {method: 'GET'}
    );
    const rec = (Array.isArray(rows) && rows[0]) || null;
    if (!rec) return null;
    if (new Date(rec.expires_at).getTime() <= Date.now()) return null;
    return rec.email;
}

// 查邮箱是否为 admin 角色（仅服务端查 service_role 可读）
async function isAdminEmail (email) {
    if (!email) return false;
    const rows = await sbFetch(
        `email_accounts?email=eq.${encodeURIComponent(email)}&select=role`,
        {method: 'GET'}
    );
    const rec = (Array.isArray(rows) && rows[0]) || null;
    return !!(rec && rec.role === 'admin');
}

// 串起来用：合法管理员返回 email，否则返回 null
async function requireAdmin (token) {
    const email = await emailFromToken(token);
    if (!email) return null;
    const admin = await isAdminEmail(email);
    return admin ? email : null;
}

module.exports = {
    emailFromToken,
    isAdminEmail,
    requireAdmin
};
