// TwT 反馈 —— 数据层（借鉴发帖社区 index.html 的 Store 抽象）
// 所有写操作通过 Netlify 函数完成，读操作可通过 Supabase REST（RLS 保护）。
// 接口：getAll / add / like / addComment / deleteComment / removeOwn / subscribe / uploadImage
// 线上走 Netlify 函数 + Supabase，配置缺失或失败则回退到 localStorage（仅本机可见）。

import TWF_CONFIG from './tw-feedback-config.js';

const TABLE = 'feedback';
const USERNAMES_TABLE = 'usernames';
const LS_KEY = 'twt_feedback_v1';
const LS_LIKED = 'twt_feedback_liked_v1';
const DEVICE_KEY = 'twt_device_id';
const LS_NAME_KEY = 'twt_feedback_name';
const LS_NAME_UPDATED = 'twt_feedback_name_updated';
export const DAILY_LIMIT_COUNT = 3;
export const NAME_COOLDOWN_DAYS = 45;

// Netlify 函数端点
const LIKE_ENDPOINT = '/.netlify/functions/like-comment';
const COMMENT_ENDPOINT = '/.netlify/functions/comment';
const DELETE_POST_ENDPOINT = '/.netlify/functions/delete-post';
const SUBMIT_ENDPOINT =
    (typeof window !== 'undefined' && window.__TW_SUBMIT_ENDPOINT) ||
    '/.netlify/functions/submit-feedback';
const UPLOAD_ENDPOINT =
    (typeof window !== 'undefined' && window.__TW_UPLOAD_ENDPOINT) ||
    '/.netlify/functions/upload-image';

// 设备唯一标识
export function getDeviceId () {
    let id = '';
    try {
        id = localStorage.getItem(DEVICE_KEY) || '';
    } catch (e) { /* 忽略 */ }
    if (!id) {
        id = uid() + uid() + uid();
        try {
            localStorage.setItem(DEVICE_KEY, id);
        } catch (e) { /* 忽略 */ }
    }
    return id;
}

// 设备级密钥
const SECRET_KEY = 'twt_device_secret';
export function getDeviceSecret () {
    let s = '';
    try {
        s = localStorage.getItem(SECRET_KEY) || '';
    } catch (e) { /* 忽略 */ }
    if (!s) {
        s = uid() + uid() + uid() + uid();
        try {
            localStorage.setItem(SECRET_KEY, s);
        } catch (e) { /* 忽略 */ }
    }
    return s;
}

function uid () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function startOfToday () {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function normalize (row) {
    return {
        id: row.id,
        name: row.name || '匿名',
        text: row.text || '',
        image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
        time: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        likes: row.likes || 0,
        comments: Array.isArray(row.comments) ? row.comments : [],
        owner_id: row.owner_id || '',
        status: row.status || 'normal'
    };
}

// 计算当天反馈条数
export function countToday (list, ownerId) {
    const start = startOfToday();
    return list.filter(item => item.owner_id === ownerId && item.time >= start).length;
}

// 调用 Netlify 函数（写操作统一走这里）
async function callNetlify (endpoint, body, token) {
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...body,
            token: token || '',
            device_id: getDeviceId(),
            device_secret: getDeviceSecret()
        })
    });
    return resp.json();
}

export function createFeedbackStore () {
    // ONLINE 检测：检查是否有有效的 Supabase 配置
    const ONLINE = TWF_CONFIG.SUPABASE_URL &&
        !TWF_CONFIG.SUPABASE_URL.startsWith('https://YOUR-') &&
        TWF_CONFIG.SUPABASE_ANON_KEY &&
        !TWF_CONFIG.SUPABASE_ANON_KEY.startsWith('sb_publishable_YOUR-');

    // ---------- 线上实现（Netlify 函数 + Supabase） ----------
    const online = {
        mode: 'online',

        // 读取所有反馈（RLS 已限制，仅公开字段可查）
        async getAll () {
            try {
                const resp = await fetch(
                    `${TWF_CONFIG.SUPABASE_URL}/rest/v1/${TABLE}?` +
                    `select=id,name,text,image_urls,likes,comments,created_at,owner_id,likers,status&` +
                    `order=created_at.desc`,
                    {
                        headers: {
                            'apikey': TWF_CONFIG.SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${TWF_CONFIG.SUPABASE_ANON_KEY}`
                        }
                    }
                );
                const data = await resp.json();
                return (Array.isArray(data) ? data : []).map(normalize);
            } catch (e) {
                throw new Error('Failed to fetch feedback: ' + e.message);
            }
        },

        // 发帖（AI 审核 + 入库都在服务端完成）
        async add (p, token) {
            return callNetlify(SUBMIT_ENDPOINT, {
                name: p.name,
                text: p.text,
                image_urls: p.image_urls || [],
                owner_id: p.owner_id || getDeviceId(),
                owner_secret: getDeviceSecret()
            }, token).then(data => {
                if (data.pass === true && data.row) {
                    return {status: 'ok', row: normalize(data.row)};
                }
                return {status: 'rejected', reason: data.reason || data.error || 'moderation'};
            });
        },

        // 点赞（通过 Netlify 函数）
        async like (id, liked, device) {
            const data = await callNetlify(LIKE_ENDPOINT, {id, liked});
            if (!data.ok) throw new Error(data.error || 'Like failed');
            return null;
        },

        // 添加评论（通过 Netlify 函数）
        async addComment (id, comment) {
            const data = await callNetlify(COMMENT_ENDPOINT, {
                action: 'add',
                id,
                comment,
                caller_secret: getDeviceSecret()
            });
            if (!data.ok) throw new Error(data.error || 'Comment failed');
            return null;
        },

        // 删除评论（通过 Netlify 函数）
        async deleteComment (id, comment) {
            const data = await callNetlify(COMMENT_ENDPOINT, {
                action: 'delete',
                id,
                comment,
                caller_secret: getDeviceSecret()
            });
            if (!data.ok) throw new Error(data.error || 'Delete comment failed');
            return null;
        },

        // 删除自己的帖子（通过 Netlify 函数）
        async removeOwn (id) {
            const data = await callNetlify(DELETE_POST_ENDPOINT, {
                id,
                owner_secret: getDeviceSecret()
            });
            if (!data.ok) throw new Error(data.error || 'Delete post failed');
            return null;
        },

        // 上传图片（通过 Netlify 函数）
        async uploadImage (file, token) {
            const resp = await fetch(UPLOAD_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': file.type || 'application/octet-stream',
                    'x-tw-token': token || ''
                },
                body: file
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Upload failed');
            return data.url;
        },

        // 订阅（轮询）
        subscribe (cb) {
            return setInterval(() => {
                this.getAll().then(cb, () => {});
            }, 8000);
        },

        // 获取用户名
        async getUsername (deviceId) {
            const resp = await fetch(
                `${TWF_CONFIG.SUPABASE_URL}/rest/v1/${USERNAMES_TABLE}?` +
                `device_id=eq.${encodeURIComponent(deviceId)}&select=device_id,name,created_at,name_updated_at`,
                {
                    headers: {
                        'apikey': TWF_CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${TWF_CONFIG.SUPABASE_ANON_KEY}`
                    }
                }
            );
            const data = await resp.json();
            return (Array.isArray(data) && data[0]) ? data[0] : null;
        },

        // 批量获取用户名（返回 map）
        async getUsernames (deviceIds) {
            if (!Array.isArray(deviceIds) || !deviceIds.length) return Promise.resolve({});
            const uniq = Array.from(new Set(deviceIds.map(String).filter(Boolean))).slice(0, 100);
            const q = uniq.map(encodeURIComponent).join(',');
            const resp = await fetch(
                `${TWF_CONFIG.SUPABASE_URL}/rest/v1/${USERNAMES_TABLE}?` +
                `device_id=in.(${q})&select=device_id,name,avatar_url`,
                {
                    headers: {
                        'apikey': TWF_CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${TWF_CONFIG.SUPABASE_ANON_KEY}`
                    }
                }
            );
            const data = await resp.json();
            const map = {};
            (Array.isArray(data) ? data : []).forEach(rec => {
                map[rec.device_id] = {name: rec.name, avatar_url: rec.avatar_url || ''};
            });
            return map;
        },

        // 设置用户名（通过 Netlify 函数）
        async setUsername (deviceId, name) {
            // 先检查当前状态
            const myRow = await this.getUsername(deviceId);
            if (myRow && myRow.name === name) return myRow;

            if (myRow) {
                // 修改：走 rename_username RPC（需通过 Netlify 函数）
                const data = await callNetlify(COMMENT_ENDPOINT, {
                    action: 'rename',
                    device_id: deviceId,
                    new_name: name,
                    caller_secret: getDeviceSecret()
                });
                if (!data.ok) throw new Error(data.error || 'Rename failed');
                return this.getUsername(deviceId);
            } else {
                // 新建：直接插入（anon 有 INSERT 权限）
                const resp = await fetch(
                    `${TWF_CONFIG.SUPABASE_URL}/rest/v1/${USERNAMES_TABLE}`,
                    {
                        method: 'POST',
                        headers: {
                            'apikey': TWF_CONFIG.SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${TWF_CONFIG.SUPABASE_ANON_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        },
                        body: JSON.stringify([{
                            device_id: deviceId,
                            name,
                            device_secret: getDeviceSecret()
                        }])
                    }
                );
                const data = await resp.json();
                return (Array.isArray(data) && data[0]) ? data[0] : null;
            }
        }
    };

    // ---------- 本地实现（localStorage 兜底） ----------
    let bc = null;
    try {
        bc = new BroadcastChannel('twt_feedback_channel');
    } catch (e) { /* 忽略 */ }

    function lsRead () {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function lsWrite (list) {
        localStorage.setItem(LS_KEY, JSON.stringify(list));
        if (bc) {
            try {
                bc.postMessage({t: 'sync'});
            } catch (e) { /* 忽略 */ }
        }
    }

    const local = {
        mode: 'local',

        async getAll () {
            return Promise.resolve(lsRead());
        },

        async add (p) {
            const list = lsRead();
            const item = {
                id: uid(),
                name: p.name,
                text: p.text,
                image_urls: p.image_urls || [],
                owner_id: p.owner_id || '',
                time: Date.now(),
                likes: 0,
                comments: []
            };
            list.unshift(item);
            lsWrite(list);
            return Promise.resolve({status: 'ok', row: item});
        },

        async like (id, liked, device) {
            const list = lsRead().map(x => {
                if (x.id !== id) return x;
                const had = !!x._likedByMe;
                const next = liked ? x.likes + (had ? 0 : 1) : Math.max(0, x.likes - (had ? 1 : 0));
                return Object.assign({}, x, {likes: next, _likedByMe: !!liked});
            });
            lsWrite(list);
            return Promise.resolve();
        },

        async addComment (id, comment) {
            const list = lsRead().map(x =>
                (x.id === id)
                    ? Object.assign({}, x, {comments: [...(x.comments || []), comment]})
                    : x);
            lsWrite(list);
            return Promise.resolve();
        },

        async deleteComment (id, comment) {
            const match = c => c && comment &&
                c.time === comment.time && c.text === comment.text && c.owner_id === comment.owner_id;
            const list = lsRead().map(x =>
                (x.id === id)
                    ? Object.assign({}, x, {comments: (x.comments || []).filter(c => !match(c))})
                    : x);
            lsWrite(list);
            return Promise.resolve();
        },

        async removeOwn (id) {
            lsWrite(lsRead().filter(x => x.id !== id));
            return Promise.resolve();
        },

        async uploadImage (file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('图片读取失败'));
                reader.readAsDataURL(file);
            });
        },

        subscribe (cb) {
            if (bc) bc.onmessage = () => cb();
            window.addEventListener('storage', e => {
                if (e.key === LS_KEY) cb();
            });
        },

        async getUsername () {
            let name = '';
            let updated = 0;
            try {
                name = localStorage.getItem(LS_NAME_KEY) || '';
                updated = Number(localStorage.getItem(LS_NAME_UPDATED)) || 0;
            } catch (e) { /* 忽略 */ }
            if (!name) return Promise.resolve(null);
            return Promise.resolve({
                name,
                name_updated_at: new Date(updated || Date.now()).toISOString()
            });
        },

        async getUsernames () {
            return Promise.resolve({});
        },

        async setUsername (deviceId, name) {
            let prev = '';
            let updated = 0;
            try {
                prev = localStorage.getItem(LS_NAME_KEY) || '';
                updated = Number(localStorage.getItem(LS_NAME_UPDATED)) || 0;
            } catch (e) { /* 忽略 */ }
            if (prev && prev !== name && updated) {
                const cd = NAME_COOLDOWN_DAYS * 86400000;
                const elapsed = Date.now() - updated;
                if (elapsed < cd) {
                    const days = Math.ceil((cd - elapsed) / 86400000);
                    const err = new Error('cooldown:' + days);
                    err.cooldownDays = days;
                    return Promise.reject(err);
                }
            }
            const now = Date.now();
            try {
                localStorage.setItem(LS_NAME_KEY, name);
                localStorage.setItem(LS_NAME_UPDATED, String(now));
            } catch (e) { /* 忽略 */ }
            return Promise.resolve({name, name_updated_at: new Date(now).toISOString()});
        }
    };

    let current = ONLINE ? online : local;

    // 本地降级安全检查标志：防止服务端不可用时无限发帖
    let localModeActive = false;

    const wrapper = {
        get mode () {
            return current.mode;
        },
        getAll: (...args) => current.getAll(...args),
        add: (...args) => current.add(...args),
        like: (...args) => current.like(...args),
        addComment: (...args) => current.addComment(...args),
        deleteComment: (...args) => current.deleteComment(...args),
        removeOwn: (...args) => current.removeOwn(...args),
        uploadImage: (...args) => current.uploadImage(...args),
        subscribe: cb => current.subscribe(cb),
        getUsername: (...args) => current.getUsername(...args),
        getUsernames: (...args) => current.getUsernames(...args),
        setUsername: (...args) => current.setUsername(...args),
        // 切换到本地降级模式（仅用于服务端完全不可用时的紧急回退）
        // 注意：本地模式下 AI 审核、每日上限、用户名唯一性均不生效
        fallbackToLocal () {
            if (current.mode !== 'local') {
                localModeActive = true;
                console.warn('[TwT] 已进入本地降级模式，安全校验已禁用');
            }
            current = local;
        },
        isLocalModeActive () {
            return localModeActive;
        }
    };
    return wrapper;
}
