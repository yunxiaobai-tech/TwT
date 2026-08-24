// netlify/functions/send-code.js
// 邮箱验证码登录：生成 6 位验证码并通过 Resend 发送。
// 服务端完成限流（邮箱 60s 冷却、每天 5 次；设备每天 10 次），验证码 5 分钟有效。
//
// 需 Netlify 环境变量：
//   SUPABASE_URL               （项目地址，缺省回退到下方公开值）
//   SUPABASE_SERVICE_ROLE_KEY  （服务端专用密钥，绝不可放入前端）
//   RESEND_API_KEY             （Resend Sending API key）
//   RESEND_FROM_EMAIL          （可选，默认 onboarding@resend.dev）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'TwT <onboarding@resend.dev>';

const CODE_TTL_SECONDS = 300; // 验证码 5 分钟过期
const RESEND_COOLDOWN_MS = 60000; // 同一邮箱 60 秒内不能重发
const MAX_PER_EMAIL_PER_DAY = 5; // 同一邮箱每天最多 5 条
const MAX_PER_DEVICE_PER_DAY = 10; // 同一设备每天最多 10 条

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
        try {
            body = JSON.parse(text);
        } catch (e) {
            body = null;
        }
    }
    if (!resp.ok) {
        const err = new Error((body && (body.message || body.error_description)) ||
            text.slice(0, 200) || `HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return body;
}

function startOfDayUTC () {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return cors({}, 204);
    if (event.httpMethod !== 'POST') return cors({error: 'method_not_allowed'}, 405);
    if (!SERVICE_ROLE_KEY) return cors({error: 'server_missing_db_key'}, 500);
    if (!RESEND_API_KEY) return cors({error: 'server_missing_resend_key'}, 500);

    try {
        const body = JSON.parse(event.body || '{}');
        const email = (body.email || '').toString().trim().toLowerCase();
        const deviceId = (body.device_id || '').toString().slice(0, 120);

        // 人机验证（Cloudflare Turnstile）：必须服务端校验，防止绕过前端刷邮件额度
        const cfToken = (body.cf_turnstile_response || '').toString().slice(0, 3000);
        if (!cfToken) {
            return cors({error: 'captcha_required'}, 403);
        }
        let cfOk = false;
        try {
            const cfResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: `secret=${encodeURIComponent(process.env.TURNSTILE_SECRET_KEY || '')}` +
                      `&response=${encodeURIComponent(cfToken)}`
            });
            const cfData = await cfResp.json().catch(() => ({}));
            cfOk = !!(cfData && cfData.success);
        } catch (e) {
            cfOk = false;
        }
        if (!cfOk) {
            return cors({error: 'captcha_invalid'}, 403);
        }

        // 基本校验
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return cors({error: 'invalid_email'}, 400);
        }
        if (!deviceId) {
            return cors({error: 'missing_device_id'}, 400);
        }

        // 60 秒冷却
        const existing = await sbFetch(
            `email_codes?email=eq.${encodeURIComponent(email)}&select=sent_at`,
            {method: 'GET'}
        );
        const rec = (Array.isArray(existing) && existing[0]) || null;
        if (rec) {
            const lastSent = new Date(rec.sent_at).getTime();
            const elapsed = Date.now() - lastSent;
            if (elapsed < RESEND_COOLDOWN_MS) {
                return cors({
                    error: 'rate_limit',
                    retry_after_ms: RESEND_COOLDOWN_MS - elapsed
                }, 429);
            }
        }

        const todayStart = startOfDayUTC();

        // 同一邮箱今天次数
        const emailLogs = await sbFetch(
            `email_send_logs?email=eq.${encodeURIComponent(email)}` +
            `&sent_at=gte.${encodeURIComponent(todayStart)}&select=id`,
            {method: 'GET'}
        );
        if (Array.isArray(emailLogs) && emailLogs.length >= MAX_PER_EMAIL_PER_DAY) {
            return cors({error: 'daily_limit_email'}, 429);
        }

        // 同一设备今天次数
        const deviceLogs = await sbFetch(
            `email_send_logs?device_id=eq.${encodeURIComponent(deviceId)}` +
            `&sent_at=gte.${encodeURIComponent(todayStart)}&select=id`,
            {method: 'GET'}
        );
        if (Array.isArray(deviceLogs) && deviceLogs.length >= MAX_PER_DEVICE_PER_DAY) {
            return cors({error: 'daily_limit_device'}, 429);
        }

        // 生成 6 位数字验证码
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // 调用 Resend 发送验证码邮件
        const resendResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [email],
                subject: 'TwT 验证码',
                html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TwT 验证码</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 480px; margin: 0 auto; padding: 40px 24px;">

    <!-- Logo + Greeting inline -->
    <p style="margin: 0 0 8px; font-size: 16px; color: #1a1a2e; font-weight: 500;">
      <img src="data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHdpZHRoPSI2OCIgaGVpZ2h0PSIzMSIgdmlld0JveD0iMCwwLDkwLjMxMTI0LDQxLjc4MTM1IiBzdHlsZT0iZGlzcGxheTogYmxvY2s7Ij4KICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xOTQuODQ0MzgsLTE1OS4xMDkzMikiPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZyBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIj4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8cGF0aCBkPSJNMTk1LjMzMTg2LDIwMC44MzQ3Yy0xLjMwNTM3LC0xLjE5MzQ4IDAuMDgxODksLTUuMTU4NjMgMy4zMTE3MywtMTAuNzY0MThjMy40NzYzLC02LjAzMzMxIDguMTY5MjMsLTEwLjAxNjg5IDguMTY5MjMsLTEwLjAxNjg5YzAsMCAtNC41NjIyNCwtNy45NjIzOSAtMS43NjM3MSwtMTAuNTk5MTFjMS43ODM1NSwtMS42ODA0MiAxMS42NzQzNCwwLjk5Mjk5IDEzLjc5NjEyLDEuMTEzMDFjMS4wMDc2OSwwLjA1NyAzLjQyNjk0LC0xLjU2MTI2IDYuMDkxOTQsLTIuMjcyMjNjNC4xNjY2MSwtMS4xMTE1NyA3LjY2MTczLC0xLjIwMjcxIDguMjg4MzEsLTEuNjgzNDFjMC44MzkxMiwtMC42NDM3NSA0LjE1Nzk1LC03LjgzNTI3IDYuMzA2LC03LjQ5MDU3YzQuMjYyNDgsMC42ODQwMSA3LjM5Mjg2LDcuODczMzUgOC40MzA4Myw3Ljk5MDljMC43MDAwMywwLjA3OTI4IDMuODg2NTYsMC4yNDQ4NyAxMC44MTczLDIuNDgyNzhjMTQuOTg1NTMsNC44Mzg3NSAyNy4wMDcwNywyMS4wNTI0MSAyNi4zNTAzMiwyMy45NjcxOGMwLjAzODMyLC0wLjAxMjQ0IC0wLjAzNjU5LDEuNTk2MzQgLTEuNjY0MjcsMS44NjcwOWMtMC41MzkyMSwwLjA4OTY5IC0yMS4wOTY4OCwxLjc3NzM3IC00Mi4yOTg1OSwzLjIxMjI0Yy0xLjA4Nzc4LDAuMDczNjIgLTQ1LjMyNjQzLDIuNjU4MzUgLTQ1LjgzNTIsMi4xOTMxOXoiIGZpbGw9IiMxYTFhMmUiLz4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8cGF0aCBkPSJNMjMxLjQxNTI2LDE4NC4zNzEwNGMwLC0zLjEyODY2IDIuNTM2MjksLTUuNjY0OTUgNS42NjQ5NSwtNS42NjQ5NWMzLjEyODY2LDAgNS42NjQ5NiwyLjUzNjI5IDUuNjY0OTYsNS42NjQ5NWMwLDMuMTI4NjYgLTIuNTM2Myw1LjY2NDk2IC01LjY2NDk2LDUuNjY0OTZjLTMuMTI4NjYsMCAtNS42NjQ5NSwtMi41MzYzIC01LjY2NDk1LC01LjY2NDk2eiIgZmlsbD0iI2ZmZmZmZiIvPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxwYXRoIGQ9Ik0yNTMuMTU1ODIsMTg1LjU4NzgyYy0yLjMyMDg0LC0xLjQ5NzM1IC0zLjM1MjQ0LC00LjQ0ODc1IC0yLjE3NzIyLC02LjcxOWMxLjE3NTIxLC0yLjI3MDI1IDQuMzE3... [truncated] width="22" height="22" alt="TwT" style="display: inline-block; vertical-align: middle; margin-right: 8px;">
      Hi，欢迎使用 TwT！
    </p>
    <p style="margin: 0 0 24px; font-size: 14px; color: #666666; line-height: 1.6;">
      你的验证码是，有效期 5 分钟：
    </p>

    <!-- Code Boxes -->
    <div style="text-align: center; margin-bottom: 32px;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
        <tr>
          <td style="padding: 0 5px;"><div style="width: 46px; height: 62px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; text-align: center; line-height: 62px; font-size: 26px; font-weight: 700; color: #1a1a2e; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">${code[0] || '·'}</div></td>
          <td style="padding: 0 5px;"><div style="width: 46px; height: 62px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; text-align: center; line-height: 62px; font-size: 26px; font-weight: 700; color: #1a1a2e; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">${code[1] || '·'}</div></td>
          <td style="padding: 0 5px;"><div style="width: 46px; height: 62px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; text-align: center; line-height: 62px; font-size: 26px; font-weight: 700; color: #1a1a2e; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">${code[2] || '·'}</div></td>
          <td style="padding: 0 5px;"><div style="width: 46px; height: 62px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; text-align: center; line-height: 62px; font-size: 26px; font-weight: 700; color: #1a1a2e; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">${code[3] || '·'}</div></td>
          <td style="padding: 0 5px;"><div style="width: 46px; height: 62px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; text-align: center; line-height: 62px; font-size: 26px; font-weight: 700; color: #1a1a2e; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">${code[4] || '·'}</div></td>
          <td style="padding: 0 5px;"><div style="width: 46px; height: 62px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; text-align: center; line-height: 62px; font-size: 26px; font-weight: 700; color: #1a1a2e; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">${code[5] || '·'}</div></td>
        </tr>
      </table>
    </div>

    <!-- Reminder -->
    <p style="margin: 0 0 32px; font-size: 13px; color: #888888; line-height: 1.6;">
      如果这不是你发起的操作，可以安全地忽略这封邮件。
    </p>

    <!-- Divider -->
    <div style="border-top: 1px solid #e8e8e8; margin-bottom: 20px;"></div>

    <!-- Footer -->
    <p style="margin: 0; font-size: 12px; color: #aaaaaa; line-height: 1.8;">
      TwT · 让 TurboWarp 更加舒适<br>
      此邮件由系统自动发送，请勿回复
    </p>

  </div>
</body>
</html>`
            })
        });
        if (!resendResp.ok) {
            const errText = await resendResp.text();
            console.error('Resend error:', errText);
            return cors({error: 'send_failed', detail: errText.slice(0, 200)}, 502);
        }

        // 写入/覆盖验证码记录（upsert，email 为主键）
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CODE_TTL_SECONDS * 1000);
        await sbFetch('email_codes?on_conflict=email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
                email: email,
                device_id: deviceId,
                code: code,
                attempts: 0,
                sent_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
                verified: false
            })
        });

        // 记录发送日志（用于限流统计）
        await sbFetch('email_send_logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                email: email,
                device_id: deviceId,
                sent_at: now.toISOString()
            })
        });

        return cors({ok: true});
    } catch (e) {
        console.error(e);
        return cors({error: String(e && e.message ? e.message : e)}, 500);
    }
};
