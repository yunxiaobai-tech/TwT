// TwT 邮箱账户登录/注册 —— 前端辅助函数
// 不引入重量级 SDK，直接 fetch 调用 Netlify Functions。
// 注册：邮箱+密码+用户名 → 发验证码 → 校验通过后建账户（含密码哈希）。
// 登录：邮箱+密码 → 校验通过发登录态。

import { getDeviceId } from './tw-feedback-store.js';

const AUTH_TOKEN_KEY = 'twt_email_token';
const AUTH_EMAIL_KEY = 'twt_email_email';
const AUTH_EXPIRES_KEY = 'twt_email_expires';

const SEND_ENDPOINT = '/.netlify/functions/send-code';
const VERIFY_ENDPOINT = '/.netlify/functions/verify-code';
const REGISTER_ENDPOINT = '/.netlify/functions/register';
const LOGIN_ENDPOINT = '/.netlify/functions/login';
const AVATAR_ENDPOINT = '/.netlify/functions/avatar';
const LOGOUT_ENDPOINT = '/.netlify/functions/logout';
const ADMIN_ENDPOINT = '/.netlify/functions/admin';
const RESET_PASSWORD_ENDPOINT = '/.netlify/functions/reset-password';

// 本地兜底：未登录或接口失败时，头像存本机
const AVATAR_LOCAL_KEY = 'twt_avatar_url';

async function postJSON (url, payload) {
    const resp = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    return {ok: resp.ok, status: resp.status, data};
}

/**
 * 发送验证码到指定邮箱（注册时验证邮箱所有权）。
 * @param {string} email 用户邮箱
 */
export function sendCode (email, cfToken) {
    return postJSON(SEND_ENDPOINT, {
        email: email,
        device_id: getDeviceId(),
        cf_turnstile_response: cfToken || ''
    });
}

/**
 * 校验验证码（旧流程保留，兼容用）。成功后写 token。
 */
export async function verifyCode (email, code) {
    const result = await postJSON(VERIFY_ENDPOINT, {
        email: email,
        code: code,
        device_id: getDeviceId()
    });
    if (result.ok && result.data && result.data.token) {
        saveSession(result.data);
    }
    return result;
}

/**
 * 注册：校验验证码 + 设置密码 + 初始用户名，成功后自动写登录态。
 * @param {string} email
 * @param {string} code 6 位验证码
 * @param {string} password 明文密码（仅经 HTTPS 传给函数，函数内哈希）
 * @param {string} username 初始昵称
 */
export async function register (email, code, password, username) {
    const result = await postJSON(REGISTER_ENDPOINT, {
        email: email,
        code: code,
        password: password,
        username: username,
        device_id: getDeviceId()
    });
    if (result.ok && result.data && result.data.token) {
        saveSession(result.data);
    }
    return result;
}

/**
 * 登录：邮箱 + 密码，成功后自动写登录态。
 * @param {string} email
 * @param {string} password
 */
export async function login (email, password) {
    const result = await postJSON(LOGIN_ENDPOINT, {
        email: email,
        password: password,
        device_id: getDeviceId()
    });
    if (result.ok && result.data && result.data.token) {
        saveSession(result.data);
    }
    return result;
}

function saveSession (data) {
    try {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_EMAIL_KEY, data.email);
        localStorage.setItem(AUTH_EXPIRES_KEY, data.expires_at);
    } catch (e) { /* 忽略 */ }
}

let _cachedSession = null;
let _sessionCacheTime = 0;

/**
 * 读取当前登录态（含过期检查）。
 * @returns {{token:string, email:string, expiresAt:string}|null}
 */
export function getSession () {
    // 快速路径：未过期则直接返回缓存
    const now = Date.now();
    if (_cachedSession && now - _sessionCacheTime < 1000) {
        return _cachedSession;
    }
    try {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        const email = localStorage.getItem(AUTH_EMAIL_KEY);
        const expires = localStorage.getItem(AUTH_EXPIRES_KEY);
        if (!token || !email || !expires) {
            _cachedSession = null;
            return null;
        }
        if (new Date(expires).getTime() <= now) {
            clearSession();
            return null;
        }
        _cachedSession = {token, email, expiresAt: expires};
        _sessionCacheTime = now;
        return _cachedSession;
    } catch (e) {
        return null;
    }
}

/** 当前是否已登录。 */
export function isLoggedIn () {
    return !!getSession();
}

/** 清除登录态。 */
export function clearSession () {
    try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_EMAIL_KEY);
        localStorage.removeItem(AUTH_EXPIRES_KEY);
    } catch (e) { /* 忽略 */ }
    _cachedSession = null;
}

/**
 * 解除本设备登录：清本地态，并通知后端删除当前 token 对应的 session 行。
 * 仅影响当前设备，不影响其它设备的登录。
 * @returns {Promise<{ok:boolean}>}
 */
export async function logout () {
    const session = getSession();
    const token = session && session.token;
    clearSession();
    if (token) {
        try {
            await fetch(LOGOUT_ENDPOINT, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({token})
            });
        } catch (e) { /* 忽略，本地态已清 */ }
    }
    return {ok: true};
}

/**
 * 读取当前用户头像与注册时间。
 * 已登录 → 调后端返回账户头像（跨设备同步）；未登录/失败 → 回退 localStorage。
 * @returns {Promise<{url:string, createdAt:?string, source:'server'|'local'}>}
 */
export async function getAvatar () {
    const session = getSession();
    if (session) {
        try {
            const resp = await fetch(`${AVATAR_ENDPOINT}?token=${encodeURIComponent(session.token)}`);
            const data = await resp.json().catch(() => ({}));
            if (data && data.ok) {
                const url = (data.avatar_url || '') || localStorage.getItem(AVATAR_LOCAL_KEY) || '';
                return {url, createdAt: data.created_at || null, source: 'server'};
            }
        } catch (e) { /* 忽略，走本地兜底 */ }
    }
    try {
        return {url: localStorage.getItem(AVATAR_LOCAL_KEY) || '', createdAt: null, source: 'local'};
    } catch (e) {
        return {url: '', createdAt: null, source: 'local'};
    }
}

/**
 * 保存头像。
 * 已登录 → 调后端存账户（跨设备同步，同时同步到 usernames 供反馈区展示）；
 * 未登录 → 仅存本机。
 * 成功后广播 twt-avatar-changed 事件，菜单栏/反馈区等组件实时更新。
 * @param {string} dataUrl base64 data URL
 * @returns {Promise<{ok:boolean, source:'server'|'local', error?:string}>}
 */
export async function setAvatar (dataUrl) {
    const session = getSession();
    let saved = false;
    let savedSource = 'local';
    if (session) {
        try {
            const resp = await fetch(AVATAR_ENDPOINT, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({token: session.token, avatar_url: dataUrl})
            });
            const data = await resp.json().catch(() => ({}));
            if (data && data.ok) {
                try {
                    localStorage.setItem(AVATAR_LOCAL_KEY, dataUrl);
                } catch (e) { /* 忽略 */ }
                saved = true;
                savedSource = 'server';
            }
            // 后端拒绝（如未登录态失效）：继续走本地兜底
        } catch (e) { /* 忽略，走本地兜底 */ }
    }
    if (!saved) {
        try {
            localStorage.setItem(AVATAR_LOCAL_KEY, dataUrl);
            saved = true;
            savedSource = 'local';
        } catch (e) {
            return {ok: false, source: 'local', error: String(e && e.message ? e.message : e)};
        }
    }
    // 广播头像变化，同页组件（菜单栏/反馈区）立即更新，跨标签页也由 storage 事件同步
    try {
        window.dispatchEvent(new CustomEvent('twt-avatar-changed', {detail: {url: dataUrl}}));
        window.dispatchEvent(new StorageEvent('storage', {key: AVATAR_LOCAL_KEY}));
    } catch (e) { /* 忽略 */ }
    return {ok: true, source: savedSource};
}

/* ---------------- 管理员相关 ---------------- */

/**
 * 查询当前登录态的角色。
 * 已登录 → 后端确认 role（'admin' / 'user'）；未登录 → 'guest'。
 * 注意：角色只能由服务端判断，本函数结果只用于「要不要显示管理按钮」，
 * 真正的鉴权在服务端 admin.js 的每个动作里都会再做一遍。
 * @returns {Promise<{role:'guest'|'user'|'admin', email:string|null}>}
 */
export async function getMyRole () {
    const session = getSession();
    if (!session) return {role: 'guest', email: null};
    try {
        const resp = await fetch(`${ADMIN_ENDPOINT}?token=${encodeURIComponent(session.token)}`);
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data && data.ok) {
            return {role: data.role || 'user', email: data.email || session.email};
        }
    } catch (e) { /* 网络失败按普通用户处理 */ }
    return {role: 'user', email: session.email};
}

/** 是否为管理员（便捷封装）。 */
export async function isAdmin () {
    const r = await getMyRole();
    return r.role === 'admin';
}

/**
 * 管理员操作统一入口。所有动作都会带 token 并在服务端二次验权。
 * @param {'deleteFeedback'|'markResolved'|'unmarkResolved'} action
 * @param {object} extra 该动作所需的附加字段（如 {id}）
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function adminCall (action, extra) {
    const session = getSession();
    if (!session) return {ok: false, error: 'not_logged_in'};
    try {
        const resp = await fetch(ADMIN_ENDPOINT, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(Object.assign({token: session.token, action}, extra || {}))
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data && data.ok) return {ok: true};
        return {ok: false, error: (data && data.error) || `HTTP ${resp.status}`};
    } catch (e) {
        return {ok: false, error: String(e && e.message ? e.message : e)};
    }
}

export async function resetPassword (email, code, newPassword) {
    const result = await postJSON(RESET_PASSWORD_ENDPOINT, {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        new_password: newPassword
    });
    return result;
}
