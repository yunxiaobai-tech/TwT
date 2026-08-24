// netlify/functions/submit-feedback.js —— 发帖服务端代理
// AI 审核 + 入库，唯一写入口。
//
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / AI_API_KEY

const {moderate} = require('./_lib/moderation');
const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');
const {getTokenDevice} = require('./_lib/auth');

const KEY = process.env.AI_API_KEY || process.env.SILICONFLOW_KEY;
const DAILY_LIMIT = 3;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204, event);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405, event);
    if (!KEY) return cors({error: 'server_missing_key'}, 500, event);
    try {
        const body = JSON.parse(event.body || '{}');
        const token = (body.token || '').toString().slice(0, 200);
        if (!token) return cors({error: 'auth_required'}, 401, event);

        // 验证登录态，获取可信 device_id
        const sessionDeviceId = await getTokenDevice(token);
        if (!sessionDeviceId) return cors({error: 'auth_invalid'}, 401, event);

        const name = (body.name || '匿名').toString().slice(0, 40);
        const text = (body.text || '').toString().slice(0, 2000);
        const imageUrls = Array.isArray(body.image_urls) ? body.image_urls : [];
        const clientOwnerSecret = (body.owner_secret || '').toString().slice(0, 200);

        // 1) 每日上限检查
        const quotaRows = await sbFetch('rpc/can_submit_feedback', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({submitter_owner_id: sessionDeviceId, p_limit: DAILY_LIMIT})
        });
        const allowed = (Array.isArray(quotaRows) ? quotaRows[0] : quotaRows) === true;
        if (!allowed) return cors({pass: false, reason: 'daily_limit'}, 429, event);

        // 2) AI 审核（纯图片帖无文字则跳过）
        if (text) {
            let pass;
            try {
                pass = await moderate('post', text);
            } catch (e) {
                return cors({error: 'upstream_error'}, e.status || 500, event);
            }
            if (!pass) return cors({pass: false}, 400, event);
        }

        // 3) 校验 owner_secret：必须与 sessionDeviceId 对应的用户名记录匹配
        //    防止客户端伪造任意 owner_secret 影响删除鉴权
        const nameRows = await sbFetch(
            `usernames?device_id=eq.${encodeURIComponent(sessionDeviceId)}&select=device_secret`,
            {method: 'GET'}
        );
        const nameRec = (Array.isArray(nameRows) && nameRows[0]) || null;
        if (!nameRec || nameRec.device_secret !== clientOwnerSecret) {
            return cors({error: 'invalid_owner_secret'}, 403, event);
        }

        // 4) 服务端入库
        const rows = await sbFetch(
            'feedback?select=id,name,text,image_urls,likes,comments,created_at,owner_id,likers,status',
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Prefer': 'return=representation'},
                body: JSON.stringify([{
                    name, text, image_urls: imageUrls,
                    owner_id: sessionDeviceId,
                    owner_secret: clientOwnerSecret,
                    likes: 0, comments: [], status: 'normal'
                }])
            }
        );
        const row = (Array.isArray(rows) && rows[0]) ? rows[0] : null;
        if (!row) return cors({error: 'insert_failed'}, 500, event);
        return cors({pass: true, row}, 200, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
