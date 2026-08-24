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
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06); overflow: hidden; max-width: 480px; width: 100%;">
          <!-- Body -->
          <tr>
            <td style="padding: 40px 40px 32px; text-align: center;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 16px;">
                          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="68" height="31" viewBox="0,0,90.31124,41.78135" style="display: block;">
                            <g transform="translate(-194.84438,-159.10932)">
                              <g stroke="none" stroke-width="0" stroke-miterlimit="10">
                                <path d="M195.33186,200.8347c-1.30537,-1.19348 0.08189,-5.15863 3.31173,-10.76418c3.4763,-6.03331 8.16923,-10.01689 8.16923,-10.01689c0,0 -4.56224,-7.96239 -1.76371,-10.59911c1.78355,-1.68042 11.67434,0.99299 13.79612,1.11301c1.00769,0.057 3.42694,-1.56126 6.09194,-2.27223c4.16661,-1.11157 7.66173,-1.20271 8.28831,-1.68341c0.83912,-0.64375 4.15795,-7.83527 6.306,-7.49057c4.26248,0.68401 7.39286,7.87335 8.43083,7.9909c0.70003,0.07928 3.88656,0.24487 10.8173,2.48278c14.98553,4.83875 27.00707,21.05241 26.35032,23.96718c0.03832,-0.01244 -0.03659,1.59634 -1.66427,1.86709c-0.53921,0.08969 -21.09688,1.77737 -42.29859,3.21224c-1.08778,0.07362 -45.32643,2.65835 -45.8352,2.19319z" fill="#1a1a2e"/>
                                <path d="M231.41526,184.37104c0,-3.12866 2.53629,-5.66495 5.66495,-5.66495c3.12866,0 5.66496,2.53629 5.66496,5.66495c0,3.12866 -2.5363,5.66496 -5.66496,5.66496c-3.12866,0 -5.66495,-2.5363 -5.66495,-5.66496z" fill="#ffffff"/>
                                <path d="M253.15582,185.58782c-2.32084,-1.49735 -3.35244,-4.44875 -2.17722,-6.719c1.17521,-2.27025 4.31793,-2.9997 6.63877,-1.50235c2.32084,1.49734 3.4553,4.55161 2.2801,6.82187c-1.17521,2.27025 -4.4208,2.89684 -6.74164,1.39948z" fill="#ffffff"/>
                              </g>
                            </g>
                          </svg>
                        </td>
                        <td style="vertical-align: middle; font-size: 26px; color: #1a1a2e; font-weight: 600;">
                          邮箱验证码
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="margin: 0; font-size: 15px; color: #4a5568; line-height: 1.6;">
                      你的 TwT 邮箱验证码是：
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 28px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto; background-color: #f8fafc; border-radius: 12px; border: 2px solid #e2e8f0;">
                      <tr>
                        <td style="padding: 20px 40px;">
                          <strong style="font-size: 36px; color: #1a1a2e; letter-spacing: 8px; font-family: 'Courier New', monospace;">${code}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 14px; color: #718096; line-height: 1.6;">
                      验证码 5 分钟内有效，请勿泄露给他人。
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top: 1px solid #edf2f7;"></td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 40px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #a0aec0; line-height: 1.5;">
                如非你本人操作，请忽略此邮件。<br>
                此邮件由系统自动发送，请勿直接回复。
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Sub-footer -->
        <table width="480" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; max-width: 480px; width: 100%;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #cbd5e0;">
                © 2026 TwT. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
