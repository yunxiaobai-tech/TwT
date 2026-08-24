// netlify/functions/upload-image.js
// TwT 反馈区「服务端代传图」：前端把图片二进制交到这里，服务端完成：
//   1) 校验有效登录态 token（持 token 才能传图，杜绝匿名上传）
//   2) 校验真实文件类型（按字节魔数，不信任前端 Content-Type）与大小（≤5MB）
//   3) 每日每设备上传次数上限（防无限上传刷桶）
//   4) 用 SUPABASE_SERVICE_ROLE_KEY 直写 feedback-images 桶（anon 已无 insert 权限）
// 返回 {url} 公开访问地址；失败返回 {error}。
//
// 为什么这样设计：此前前端用 anon key 直连 Storage 上传，任何人可无限上传任意文件，
// 且完全绕开 AI 审核。现在上传必须登录、经服务端、受类型/大小/次数三重限制。
//
// 需 Netlify 环境变量：
//   SUPABASE_URL               （项目地址；缺省回退到内置值）
//   SUPABASE_SERVICE_ROLE_KEY  （服务端专用密钥，绝不可放入前端）

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_BYTES = 5 * 1024 * 1024;   // 单文件 ≤ 5MB（原始字节；二进制原样发送以规避函数体上限）
const DAILY_LIMIT = 20;              // 每日每设备上传上限（与 SQL can_upload_image 默认一致）

// 按字节魔数识别真实类型（前端传的 file.type 不可信）
const MAGICS = [
    {sig: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], ext: 'png', mime: 'image/png'},
    {sig: [0xFF, 0xD8, 0xFF], ext: 'jpg', mime: 'image/jpeg'},
    {sig: [0x47, 0x49, 0x46], ext: 'gif', mime: 'image/gif'},
    {sig: [0x52, 0x49, 0x46, 0x46], ext: 'webp', mime: 'image/webp', webp: [0x57, 0x45, 0x42, 0x50]} // RIFF....WEBP
];

function cors (body, status = 200) {
    return {
        statusCode: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'content-type, x-tw-token',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

// 用 service_role 调 Supabase REST（绕过 RLS，属于服务端内部操作）
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
        try { body = JSON.parse(text); } catch (e) { body = null; }
    }
    if (!resp.ok) {
        const err = new Error((body && (body.message || body.error_description)) ||
            text.slice(0, 200) || `HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return body;
}

// token → device_id（无效/过期返回 null）
async function getDeviceFromToken (token) {
    try {
        const rows = await sbFetch(
            `email_sessions?token=eq.${encodeURIComponent(token)}&select=device_id,expires_at`,
            {method: 'GET'}
        );
        const s = (Array.isArray(rows) && rows[0]) || null;
        if (s && new Date(s.expires_at).getTime() > Date.now()) return (s.device_id || '').toString();
    } catch (e) { /* 视为无效 */ }
    return null;
}

// 按字节魔数识别真实类型
function detectType (buf) {
    for (const m of MAGICS) {
        if (m.sig.every((b, i) => buf[i] === b)) {
            if (m.webp) {
                const ok = m.webp.every((b, i) => buf[8 + i] === b);
                if (!ok) continue; // RIFF 但不是 WEBP
            }
            return m;
        }
    }
    return null;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405);
    if (!SERVICE_ROLE_KEY) return cors({error: 'server_missing_db_key'}, 500);

    try {
        // 1) 取 token（支持自定义头或 Bearer）
        const headerToken = (event.headers['x-tw-token'] ||
            (event.headers['authorization'] || '')).toString();
        const token = headerToken.replace(/^Bearer\s+/i, '').trim().slice(0, 200);
        if (!token) return cors({error: 'auth_required'}, 401);

        const deviceId = await getDeviceFromToken(token);
        if (!deviceId) return cors({error: 'auth_invalid'}, 401);

        // 2) 读取二进制体（Netlify 对二进制以 base64 给出 isBase64Encoded）
        const raw = event.body || '';
        const buf = event.isBase64Encoded ? Buffer.from(raw, 'base64') : Buffer.from(raw, 'utf8');
        if (!buf.length) return cors({error: 'empty_file'}, 400);
        if (buf.length > MAX_BYTES) return cors({error: 'file_too_large'}, 413);

        // 3) 真实类型校验（魔数），杜绝伪造 Content-Type 上传非图片
        const type = detectType(buf);
        if (!type) return cors({error: 'unsupported_type'}, 415);

        // 4) 每日每设备次数上限（先查后传，超限拒绝）
        const quota = await sbFetch('rpc/can_upload_image', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({p_device: deviceId, p_limit: DAILY_LIMIT})
        });
        const allowed = (typeof quota === 'boolean') ? quota : (Array.isArray(quota) ? quota[0] : false);
        if (!allowed) return cors({error: 'daily_upload_limit'}, 429);

        // 5) service_role 写入 Storage
        const path = `${deviceId}/${crypto.randomUUID()}.${type.ext}`;
        const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/feedback-images/${path}`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': type.mime,
                'x-upsert': 'true'
            },
            body: buf
        });
        if (!resp.ok) {
            const t = await resp.text();
            return cors({error: 'storage_failed', detail: t.slice(0, 200)}, 502);
        }

        // 6) 计数 +1（仅服务端可写 image_uploads）
        await sbFetch('image_uploads?select=id', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
            body: JSON.stringify([{device_id: deviceId}])
        }).catch(() => { /* 计数失败不阻断上传成功 */ });

        return cors({url: `${SUPABASE_URL}/storage/v1/object/public/feedback-images/${path}`});
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500);
    }
};
