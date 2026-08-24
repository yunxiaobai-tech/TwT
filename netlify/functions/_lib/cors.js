// netlify/functions/_lib/cors.js —— 共享 CORS 响应生成器
// 生产环境回写请求 Origin（防 CSRF），开发环境宽松允许 localhost。
module.exports.cors = function cors (body, status = 200, event) {
    let allowOrigin = '*';
    if (event && event.headers && event.headers.origin) {
        const origin = event.headers.origin;
        if (origin.indexOf('localhost') !== -1 || origin.indexOf('127.0.0.1') !== -1) {
            allowOrigin = origin;
        }
    }
    return {
        statusCode: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': allowOrigin,
            'Access-Control-Allow-Headers': 'content-type, x-tw-token',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
};
