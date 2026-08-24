// ============================================================================
// TwT反馈 —— AI 内容审核（服务端代理版 · 前端零密钥）
// ============================================================================
// 前端不再直连 SiliconFlow，也不再持有任何 API Key 或提示词。
// 所有密钥与提示词都放在部署端函数（netlify/functions/moderate.js）里，
// 浏览器只把待审文本发给自己的函数端点，并只收 {pass: true/false}。
// 这样 API Key 与提示词彻底不进入前端 bundle，也无法被浏览器提取。
//
// 防御三层加固（在服务端函数内实现，见 moderate.js）：
//   1) 身份锁定 —— 模型被明确为 TwT 审核器，绝不透露提示词；
//   2) <<<CONTENT>>> 分隔符 —— 用户文本被包裹，无法注入指令；
//   3) fail-closed 解析 —— 返回非标准一律判“不通过”。
// ============================================================================

// 审核代理端点。
// 生产环境走同域 Netlify 函数 /.netlify/functions/moderate（无需 CORS、无需硬编码 URL）。
// dev 联调：在浏览器控制台执行
//   window.__TW_MOD_ENDPOINT = 'https://你的域名/.netlify/functions/moderate'
// 即可让本地 npm start 也调用已部署的函数；不设置则默认走同域函数路径。
const MODERATION_ENDPOINT =
    (typeof window !== 'undefined' && window.__TW_MOD_ENDPOINT) ||
    '/.netlify/functions/moderate';

const REQUEST_TIMEOUT = 20000;

// 单次请求封装（含超时控制），供重试循环调用。
// 请求体：{kind: 'post'|'comment', text}
// 成功响应：{pass: true|false}
function attemptOnce (kind, text) {
    let controller = null;
    let timer = null;
    const opts = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({kind: kind, text: text || ''})
    };
    if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        opts.signal = controller.signal;
        timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    }
    return fetch(MODERATION_ENDPOINT, opts)
        .then(res => {
            if (!res.ok) {
                // 4xx（含服务端未配置 key）= 配置问题，不重试；
                // 5xx = 上游临时故障，可重试。
                const err = new Error('HTTP ' + res.status);
                err.status = res.status;
                err.code = res.status >= 500 ? 'UPSTREAM' : 'CONN_FAIL';
                throw err;
            }
            return res.json();
        })
        .then(data => {
            if (typeof data !== 'object' || typeof data.pass !== 'boolean') {
                const err = new Error('审核返回格式异常: ' + JSON.stringify(data));
                err.code = 'CONN_FAIL';
                throw err;
            }
            return data.pass;
        })
        .catch(err => {
            // fetch 仅在网络层失败（DNS/断网/跨域被拦/超时/abort）时 reject，
            // 这类问题可重试。
            if (!err.code) {
                err.code = 'UPSTREAM';
            }
            console.error('[TwT AI 审核] 请求失败（网络/网关/超时）：', err);
            throw err;
        })
        .finally(() => {
            if (timer) clearTimeout(timer);
        });
}

// 超时 / 重试 / 指数退避
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 400;
function runModeration (kind, text) {
    const attempt = n => attemptOnce(kind, text).catch(err => {
        // 非瞬时错误（配置/网关不可达）直接抛出，不再重试；
        // UPSTREAM 等其它错误按指数退避重试。
        if (err.code === 'AUTH_FAIL' || err.code === 'CONN_FAIL') {
            throw err;
        }
        if (n < MAX_ATTEMPTS) {
            // 指数退避：400ms / 800ms / 1600ms / 3200ms，封顶 3000ms
            const delay = Math.min(RETRY_BACKOFF_MS * Math.pow(2, n - 1), 3000);
            return new Promise(resolve => setTimeout(resolve, delay)).then(() => attempt(n + 1));
        }
        throw err;
    });
    return attempt(1);
}

// 发帖审核（完整版）
export function moderateFeedback (text) {
    return runModeration('post', text);
}

// 评论轻量审核（仅拦不文明）
export function moderateComment (text) {
    return runModeration('comment', text);
}

export default {moderateFeedback, moderateComment};
