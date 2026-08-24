// netlify/functions/_lib/auth.js —— 共享认证模块
// 提供 token → device_id 的解析，供所有需要鉴权的函数复用。
const {sbFetch} = require('./db');

/**
 * 用登录 token 换取 device_id；无效/过期返回 null。
 */
async function getTokenDevice (token) {
    if (!token) return null;
    const rows = await sbFetch(
        `email_sessions?token=eq.${encodeURIComponent(token)}&select=device_id,expires_at`,
        {method: 'GET'}
    );
    const rec = (Array.isArray(rows) && rows[0]) || null;
    if (!rec) return null;
    if (new Date(rec.expires_at).getTime() <= Date.now()) return null;
    return (rec.device_id || '').toString();
}

module.exports = {getTokenDevice};
