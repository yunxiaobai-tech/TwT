// TwT 反馈 —— 数据层（借鉴发帖社区 index.html 的 Store 抽象）
// 不依赖 @supabase/supabase-js，直接用浏览器 fetch 调用 Supabase REST / Storage API，
// 避免在打包后的编辑器里引入笨重的 SDK；接口与发帖社区保持一致：
//   getAll / add / update / remove / subscribe / uploadImage
// 线上走 Supabase，配置缺失或失败则回退到 localStorage（仅本机可见）。

import TWF_CONFIG from './tw-feedback-config.js';

const TABLE = 'feedback';
const BUCKET = 'feedback-images';
const USERNAMES_TABLE = 'usernames';
const LS_KEY = 'twt_feedback_v1';
const LS_LIKED = 'twt_feedback_liked_v1';
const DEVICE_KEY = 'twt_device_id';
const LS_NAME_KEY = 'twt_feedback_name';
const LS_NAME_UPDATED = 'twt_feedback_name_updated';
export const DAILY_LIMIT_COUNT = 3;
export const NAME_COOLDOWN_DAYS = 45;

// 设备唯一标识（本机持久化，用作「一个设备一个用户名」的绑定键）。
// 同时也作为用户的「终身 ID」：写入每一条反馈的 owner_id，昵称可改而它不变，
// 删除时比对 owner_id 以确认是本人发布。不展示给用户。
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

function uid () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function startOfToday () {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function reqHeaders (json) {
    const h = {
        apikey: TWF_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${TWF_CONFIG.SUPABASE_ANON_KEY}`
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
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
        // 作者终身 ID（设备唯一标识）：昵称可变，此 ID 不变，不展示，用于删除鉴权
        owner_id: row.owner_id || ''
    };
}

// 计算某用户当天的反馈条数（用于「每天最多 3 条」）
export function countToday (list, name) {
    const start = startOfToday();
    return list.filter(item => item.name === name && item.time >= start).length;
}

function rest (path, opts) {
    return fetch(`${TWF_CONFIG.SUPABASE_URL}/rest/v1/${path}`, opts)
        .then(r => {
            const ct = r.headers.get('content-type') || '';
            return r.text().then(text => {
                let body = null;
                if (text && ct.indexOf('application/json') !== -1) {
                    try {
                        body = JSON.parse(text);
                    } catch (e) {
                        body = null;
                    }
                }
                return {ok: r.ok, status: r.status, body, raw: text};
            });
        })
        .then(({ok, status, body, raw}) => {
            if (!ok) {
                const msg = (body && (body.message || body.error_description)) ||
                    (raw ? raw.slice(0, 120) : '') || `HTTP ${status}`;
                const err = new Error(msg);
                err.body = body;
                throw err;
            }
            return body;
        });
}

export function createFeedbackStore () {
    const ONLINE = TWF_CONFIG.SUPABASE_URL.indexOf('YOUR-') === -1 &&
        TWF_CONFIG.SUPABASE_ANON_KEY.indexOf('YOUR-') === -1;

    // ---------- 线上实现（Supabase REST + Storage） ----------
    const online = {
        mode: 'online',
        getAll () {
            return rest(`${TABLE}?select=*&order=created_at.desc`, {headers: reqHeaders(false)})
                .then(body => (Array.isArray(body) ? body : []).map(normalize));
        },
        add (p) {
            return rest(`${TABLE}?select=*`, {
                method: 'POST',
                headers: {...reqHeaders(true), Prefer: 'return=representation'},
                body: JSON.stringify([{
                    name: p.name,
                    text: p.text,
                    image_urls: p.image_urls || [],
                    owner_id: p.owner_id || getDeviceId(),
                    likes: 0,
                    comments: []
                }])
            }).then(body => (Array.isArray(body) && body[0]) ? normalize(body[0]) : null);
        },
        update (id, patch) {
            return rest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: {...reqHeaders(true), Prefer: 'return=representation'},
                body: JSON.stringify(patch)
            });
        },
        remove (id) {
            return rest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: reqHeaders(true)
            });
        },
        uploadImage (file) {
            const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
            const path = `${uid()}.${ext}`;
            return fetch(`${TWF_CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
                method: 'POST',
                headers: {
                    ...reqHeaders(false),
                    'Content-Type': file.type || 'application/octet-stream',
                    'x-upsert': 'true'
                },
                body: file
            }).then(r => {
                if (!r.ok) throw new Error('图片上传失败');
                return `${TWF_CONFIG.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
            });
        },
        subscribe (cb) {
            // 轻量「实时」：轮询；与发帖社区的 postgres_changes 订阅语义一致（数据变化后回调刷新）
            return setInterval(() => {
                this.getAll().then(cb, () => {});
            }, 8000);
        },
        // 读取本设备已绑定的用户名记录（不存在返回 null）
        getUsername (deviceId) {
            return rest(
                `${USERNAMES_TABLE}?device_id=eq.${encodeURIComponent(deviceId)}&select=*`,
                {headers: reqHeaders(false)}
            ).then(body => ((Array.isArray(body) && body[0]) ? body[0] : null));
        },
        // 设置/修改用户名：
        //  - 首次：插入 {device_id, name}；name 唯一约束保证全局不重复
        //  - 修改：PATCH，服务端触发器强制 45 天冷却并刷新 name_updated_at
        setUsername (deviceId, name) {
            return this.getUsername(deviceId).then(myRow => {
                if (myRow && myRow.name === name) return myRow;
                if (myRow) {
                    return rest(`${USERNAMES_TABLE}?device_id=eq.${encodeURIComponent(deviceId)}`, {
                        method: 'PATCH',
                        headers: {...reqHeaders(true), Prefer: 'return=representation'},
                        body: JSON.stringify({name})
                    }).then(body => ((Array.isArray(body) && body[0]) ? body[0] : null));
                }
                return rest(`${USERNAMES_TABLE}`, {
                    method: 'POST',
                    headers: {...reqHeaders(true), Prefer: 'return=representation'},
                    body: JSON.stringify([{device_id: deviceId, name}])
                }).then(body => ((Array.isArray(body) && body[0]) ? body[0] : null));
            });
        }
    };

    // ---------- 本地实现（localStorage 兜底，仅本机可见） ----------
    let bc = null;
    try {
        bc = new BroadcastChannel('twt_feedback_channel');
    } catch (e) { /* 忽略：部分浏览器不支持 */ }
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
        getAll () {
            return Promise.resolve(lsRead());
        },
        add (p) {
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
            return Promise.resolve(item);
        },
        update (id, patch) {
            const list = lsRead().map(x => (x.id === id ? Object.assign({}, x, patch) : x));
            lsWrite(list);
            return Promise.resolve();
        },
        remove (id) {
            lsWrite(lsRead().filter(x => x.id !== id));
            return Promise.resolve();
        },
        uploadImage (file) {
            // 本地模式无法真正上传，转为 dataURL 内嵌
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
        getUsername () {
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
        setUsername (deviceId, name) {
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

    // 线上请求失败时，组件可调用 fallbackToLocal() 切到本地兜底，弹窗不至于直接废掉
    const wrapper = {
        get mode () {
            return current.mode;
        },
        getAll: (...args) => current.getAll(...args),
        add: (...args) => current.add(...args),
        update: (...args) => current.update(...args),
        remove: (...args) => current.remove(...args),
        uploadImage: (...args) => current.uploadImage(...args),
        subscribe: cb => current.subscribe(cb),
        getUsername: (...args) => current.getUsername(...args),
        setUsername: (...args) => current.setUsername(...args),
        fallbackToLocal () {
            current = local;
        }
    };
    return wrapper;
}
