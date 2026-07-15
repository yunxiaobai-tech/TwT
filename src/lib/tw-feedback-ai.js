// TwT反馈 —— AI 内容审核
// 复用 Desktop/AI程序/index.html 的 GPT 调用逻辑：
//   端点 https://text.pollinations.ai（Pollinations 免费文本接口，匿名可用，无需 key）
//   默认模型 'openai'（GPT-4 类），请求体含 messages/model/seed/jsonMode/private
//   返回纯文本（非 OpenAI JSON 格式），故用 response.text()
//
// 为什么要区分端点（重要）：
//   Pollinations 对「Origin 为 localhost」的浏览器请求会触发 Cloudflare Turnstile，
//   返回 403 {"error":"Missing Turnstile token"}。这就是 AI程序/index.html（file:// 打开，
//   Origin=null）能用、而编辑器跑在 http://localhost:8601 时"审核服务不可用"的根因。
//   实测：127.0.0.1、真实域名（生产）均正常，唯独字面量 localhost 被拦。
//   解决：localhost 下走 webpack-dev-server 的服务端代理 /tw-ai-proxy
//         （代理转发时已删除 origin/referer 头，绕过 Turnstile）；其余环境直连。
//
// 审核约定：AI 只能回答「通过」或「不通过」两个字，组件据此决定是否发布。

const DIRECT_ENDPOINT = 'https://text.pollinations.ai';
const PROXY_ENDPOINT = '/tw-ai-proxy';
const REQUEST_TIMEOUT = 15000;

function resolveEndpoint () {
    try {
        if (typeof window !== 'undefined' && window.location &&
            window.location.hostname === 'localhost') {
            return PROXY_ENDPOINT;
        }
    } catch (e) { /* 忽略：非浏览器环境直连 */ }
    return DIRECT_ENDPOINT;
}

const MODERATION_SYSTEM = `你是"TwT反馈"社区的内容审核员。用户会提交一条反馈（可能是 bug 描述、功能建议、使用体验或吐槽），请你判断它是否适合公开发布到反馈社区。

【判定原则】
默认"倾向放行"：只要内容对产品改进、问题排查或社区讨论有哪怕一点点价值，就应判"通过"。审核目的是拦截"毫无价值/有害"的内容，而不是挑剔表达。

【以下情况判"不通过"】（满足任一即可，其余一律通过）：
1. 纯灌水/无意义：空白、乱码、随机字符、无意义的重复（如"啊啊啊""哈哈哈哈"）、纯 emoji 或无语义符号。
2. 价值过少：信息量不足以构成任何有效反馈——例如只写"好""？""测试""111""666""？？？""dddd"，没有描述任何具体问题或建议。
3. 与反馈主题无关且占比过高：如随手粘贴的广告、无关营销链接、与产品毫无关系的闲聊，且缺乏任何实质改进建议或问题描述。
4. 不文明或人身攻击：辱骂、脏话、歧视、人身攻击、引战挑衅。注意区分：对产品的"吐槽/抱怨"如果同时描述了具体问题，仍算"通过"；只有纯宣泄、无实质内容时才"不通过"。
5. 泄露他人隐私或违法违规：包含他人真实姓名/电话/住址/账号等个人隐私，或涉及违法违规、暴力、色情、政治敏感等不应出现在社区的内容。
6. 刷屏/重复：肉眼可见的复制粘贴刷屏、连续多条完全相同且无差别的内容。

【以下情况"必须通过"】（避免误杀）：
- 具体的 bug 报告，即使带情绪（如"保存后白屏气死了，控制台报 undefined"）→ 通过。
- 具体的功能建议，即使很短（如"希望能加个撤销快捷键"）→ 通过。
- 包含代码片段、报错信息、截图描述等诊断内容 → 通过（这是高价值反馈）。
- 中性或正面的使用体验分享 → 通过。

【输出格式（极严格）】
你只能输出且仅输出两个字，禁止任何解释、标点、换行或多余字符：
- 可以发布 → 只输出：通过
- 不适合发布 → 只输出：不通过`;

// 评论「轻量审核」系统词：只拦截不文明内容，其余一律放行。
// 与发帖审核不同，评论不检查"价值过少/灌水/广告"，短评论、口语、情绪化表达都算通过。
const COMMENT_MODERATION_SYSTEM = `你是"TwT反馈"社区的【评论】审核员。用户会提交一条对反馈帖子的评论/回复，请你判断它是否包含"不文明内容"。

【判定原则】
默认"放行"：评论比反馈更随意，只要不是明显不文明的，都应判"通过"。要宽容——短评论、口语、情绪化表达、轻微吐槽都算通过。

【只有以下情况判"不通过"】（满足任一即可，其余一律通过）：
1. 辱骂/脏话/人身攻击：如"去死""傻逼""垃圾人""你脑子有病"等针对他人的侮辱。注意：对产品/功能的吐槽（如"这功能真烂"）不算人身攻击，应通过。
2. 歧视/仇恨言论：针对性别、地域、种族、宗教等的歧视或仇恨表达。
3. 引战/恶意挑衅：纯粹为了激怒他人、挑起对立而无实质内容的攻击性言论。
4. 色情/暴力/违法：露骨的色情描述、暴力威胁或明显违法违规内容。

【以下情况"必须通过"】（避免误杀）：
- 简短表态：如"支持""+1""同意""哈哈""赞""顶" → 通过。
- 带情绪的产品讨论：如"这 bug 太烦人了，求修复" → 通过。
- 普通质疑/反驳：如"我不同意，我觉得这样设计有道理" → 通过。
- 纯表情、纯 emoji → 通过。
- 对他人的正常批评或不同意见（非人身攻击）→ 通过。

【输出格式（极严格）】
你只能输出且仅输出两个字，禁止任何解释、标点、换行或多余字符：
- 没有不文明内容、可以发布 → 只输出：通过
- 包含不文明内容、不适合发布 → 只输出：不通过`;

// 发帖审核的 few-shot（锚定输出格式与松紧度）
const FEEDBACK_FEWSHOT = [
    ['点击保存按钮后编辑器白屏，控制台报 undefined，气死我了，希望快点修复', '通过'],
    ['建议增加深色主题的自定义配色功能，现在默认色对比度太低看着累', '通过'],
    ['111', '不通过'],
    ['去死吧这破软件垃圾透了', '不通过'],
    ['【限时优惠】加微信 xxx 领红包 https://spam.example', '不通过']
];

// 评论轻量审核的 few-shot（普遍放行，仅明显侮辱才拦截）
const COMMENT_FEWSHOT = [
    ['支持，这个建议不错', '通过'],
    ['哈哈哈同感', '通过'],
    ['+1，期待修复', '通过'],
    ['你这人是不是脑子有问题，建议烂透了', '不通过'],
    ['傻逼玩意儿', '不通过']
];

// 把 AI 返回的纯文本解析为布尔：通过=true，不通过=false
function parseVerdict (raw) {
    const r = (raw || '').trim().replace(/[。.！!，,、\s]/g, '');
    // 必须先排除"不通过"，再判断是否以"通过"开头（避免"不通过"被误判为通过）
    if (r.indexOf('不通过') === 0) return false;
    return r.indexOf('通过') === 0;
}

// 单次请求封装（含超时控制），供重试循环调用
function attemptOnce (endpoint, payload) {
    let controller = null;
    let timer = null;
    const opts = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    };
    if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        opts.signal = controller.signal;
        timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    }
    return fetch(endpoint, opts)
        .then(res => {
            if (!res.ok) {
                return res.text().then(body => {
                    const err = new Error('HTTP ' + res.status);
                    err.status = res.status;
                    err.body = body;
                    throw err;
                });
            }
            return res.text();
        })
        .then(text => {
            if (typeof text === 'string' && text.trim().charAt(0) === '<') {
                const err = new Error('AI 返回了非预期内容（疑似错误页）');
                err.status = 0;
                throw err;
            }
            return parseVerdict(text);
        })
        .finally(() => {
            if (timer) clearTimeout(timer);
        });
}

// Pollinations 偶发网络/降级失败（实测约 1/3 请求会 fetch failed 或返回 HTML），
// 若直接兜底放行会让不文明内容溜进社区。故这里自动重试，显著减少因瞬时抖动导致的漏拦。
const MAX_ATTEMPTS = 3;
function runModeration (systemPrompt, fewShot, text) {
    const endpoint = resolveEndpoint();
    const messages = [{role: 'system', content: systemPrompt}];
    fewShot.forEach(pair => {
        messages.push({role: 'user', content: pair[0]});
        messages.push({role: 'assistant', content: pair[1]});
    });
    messages.push({role: 'user', content: text || ''});
    const payload = {
        messages,
        model: 'openai',
        seed: Math.floor(Math.random() * 999999999),
        jsonMode: false,
        private: true,
        referrer: 'twt-feedback'
    };

    const attempt = n => attemptOnce(endpoint, payload).catch(err => {
        if (n < MAX_ATTEMPTS) return attempt(n + 1);
        throw err;
    });
    return attempt(1);
}

// 发帖审核（完整版：拦截灌水/低价值/广告/不文明/违规等）
export function moderateFeedback (text) {
    return runModeration(MODERATION_SYSTEM, FEEDBACK_FEWSHOT, text);
}

// 评论轻量审核（仅拦截不文明内容，其余放行）
export function moderateComment (text) {
    return runModeration(COMMENT_MODERATION_SYSTEM, COMMENT_FEWSHOT, text);
}

export default {moderateFeedback, moderateComment};
