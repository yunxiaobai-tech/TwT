// netlify/functions/moderate.js
// TwT 反馈区 AI 审核代理（服务端）。
// 真实 SiliconFlow API Key 由 Netlify 环境变量 SILICONFLOW_KEY 提供，绝不进浏览器。
// 提示词也只存在这里（共享模块 _lib/moderation.js），前端 bundle 里不再包含。
//
// 部署：把本文件随仓库推到 Netlify 即可（Netlify 自动识别 netlify/functions/ 目录）。
// 需 Node 18+（自带 fetch）。若 Netlify 默认 Node 过低，在 netlify.toml 设
//   [build]
//     command = "npm run build"
//   [functions]
//     node_bundler = "esbuild"
//   或在 Site settings → Environment variables 加 AWS_LAMBDA_JS_RUNTIME / 用 .node-version 指定 18。

const {moderate} = require('./_lib/moderation.js');

const KEY = process.env.SILICONFLOW_KEY;

function cors (body, status = 200) {
    return {
        statusCode: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405);
    if (!KEY) return cors({error: 'server_missing_key'}, 500);
    try {
        const {kind, text} = JSON.parse(event.body || '{}');
        const pass = await moderate(kind, text);
        return cors({pass});
    } catch (e) {
        if (e && e.status) {
            // 上游（SiliconFlow）返回非 2xx：透传状态码，让前端区分「key 失效」等配置问题
            return cors({error: 'upstream_error', status: e.status}, e.status);
        }
        return cors({error: String(e && e.message ? e.message : e)}, 500);
    }
};
