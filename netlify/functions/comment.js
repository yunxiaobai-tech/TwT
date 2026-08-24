// netlify/functions/comment.js —— 评论服务端代理（add / delete）
// add：校验设备密钥，追加评论；delete：校验帖子作者或评论作者，防越权删除。
//
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');
const {getTokenDevice} = require('./_lib/auth');

/** 校验设备密钥是否合法存在 */
async function verifyDeviceSecret (deviceId, secret) {
    if (!deviceId || !secret) return false;
    const rows = await sbFetch(
        `usernames?device_id=eq.${encodeURIComponent(deviceId)}&device_secret=eq.${encodeURIComponent(secret)}&select=id`,
        {method: 'GET'}
    );
    return Array.isArray(rows) && rows.length > 0;
}

/** 获取帖子的 owner_id 和 owner_secret */
async function getPostInfo (postId) {
    const rows = await sbFetch(
        `feedback?id=eq.${encodeURIComponent(postId)}&select=owner_id,owner_secret`,
        {method: 'GET'}
    );
    return (Array.isArray(rows) && rows[0]) || null;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204, event);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405, event);
    try {
        const body = JSON.parse(event.body || '{}');
        const token = (body.token || '').toString().slice(0, 200);
        if (!token) return cors({error: 'auth_required'}, 401, event);

        const device = await getTokenDevice(token);
        if (!device) return cors({error: 'auth_invalid'}, 401, event);

        const action = (body.action || '').toString();
        const id = (body.id || '').toString();
        const callerSecret = (body.caller_secret || '').toString();

        // -------- add_comment --------
        if (action === 'add') {
            if (!id) return cors({error: 'missing_id'}, 400, event);
            const comment = body.comment;
            if (!comment || typeof comment !== 'object') return cors({error: 'missing_comment'}, 400, event);
            // 校验调用方设备密钥合法性
            const deviceValid = await verifyDeviceSecret(device, callerSecret);
            if (!deviceValid) return cors({error: 'unauthorized_comment'}, 403, event);
            await sbFetch('rpc/add_comment', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({p_id: id, p_comment: comment, p_device: device, p_secret: callerSecret})
            });
            return cors({ok: true}, 200, event);
        }

        // -------- delete_comment --------
        if (action === 'delete') {
            const comment = body.comment;
            if (!id || !comment) return cors({error: 'missing_id_or_comment'}, 400, event);
            const postInfo = await getPostInfo(id);
            if (!postInfo) return cors({error: 'post_not_found'}, 404, event);

            // 情况1：帖子作者凭 owner_secret 删任意评论
            const isPostAuthor = postInfo.owner_id === device && postInfo.owner_secret === callerSecret;
            // 情况2：评论作者凭本人设备密钥删自己评论
            const isCommentAuthor = comment.owner_id === device && await verifyDeviceSecret(device, callerSecret);

            if (!isPostAuthor && !isCommentAuthor) {
                return cors({error: 'forbidden'}, 403, event);
            }
            await sbFetch('rpc/delete_comment', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    p_id: id,
                    p_comment: comment,
                    p_secret: isPostAuthor ? callerSecret : '',
                    p_device: device,
                    p_device_secret: callerSecret
                })
            });
            return cors({ok: true}, 200, event);
        }

        // -------- rename_username --------
        if (action === 'rename') {
            if (!device || !name) return cors({error: 'missing_params'}, 400, event);
            const deviceValid = await verifyDeviceSecret(device, callerSecret);
            if (!deviceValid) return cors({error: 'unauthorized'}, 403, event);
            await sbFetch('rpc/rename_username', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({p_device: device, p_name: name, p_secret: callerSecret})
            });
            return cors({ok: true}, 200, event);
        }

        return cors({error: 'unknown_action'}, 400, event);
    } catch (e) {
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};
