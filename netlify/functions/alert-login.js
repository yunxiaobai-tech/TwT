// netlify/functions/alert-login.js —— 多设备登录安全提醒邮件
// 由 login.js 在检测到新设备登录后调用
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY

const {cors} = require('./_lib/cors');
const {sbFetch} = require('./_lib/db');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'TwT <onboarding@resend.dev>';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yqqizrnrglihvwxsignr.supabase.co';

// 同一 IP 冷却时间（毫秒）：10 分钟内相同 IP 不再重复发送提醒
const IP_COOLDOWN_MS = 10 * 60 * 1000;

function simpleMd5 (str) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex');
}

exports.handler = async (event) => {
    if (!RESEND_API_KEY) {
        return cors({error: 'missing_resend_key'}, 500, event);
    }
    if (event.httpMethod === 'OPTIONS') {
        return cors({}, 204, event);
    }
    if (event.httpMethod !== 'POST') {
        return cors({error: 'method_not_allowed'}, 405, event);
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const email = (body.email || '').toString().trim().toLowerCase();
        const device_id = (body.device_id || '').toString().slice(0, 120);
        const ip_address = (body.ip || body.remote_addr || '').toString().slice(0, 60);

        if (!email || !device_id) {
            return cors({error: 'missing_params'}, 400, event);
        }

        // 1. 检查是否同 IP 近期已发送过提醒（防滥用）
        const recentAlerts = await sbFetch(
            `device_login_logs?ip_address=eq.${encodeURIComponent(ip_address)}&logged_at=gte.${new Date(Date.now() - IP_COOLDOWN_MS).toISOString()}&alert_sent=eq.true&select=id,logged_at`,
            {method: 'GET'}
        );
        if (Array.isArray(recentAlerts) && recentAlerts.length > 0) {
            return cors({ok: false, reason: 'ip_cooldown'}, 200, event);
        }

        // 2. 发送安全提醒邮件
        const now = new Date().toISOString();
        const resendResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [email],
                subject: 'TwT 账户安全提醒：新设备登录',
                html: buildAlertEmail(htmlEscape(email), formatDate(now))
            })
        });

        if (!resendResp.ok) {
            const errText = await resendResp.text();
            console.error('Alert login email failed:', errText);
            return cors({error: 'send_failed'}, 502, event);
        }

        // 3. 记录登录日志 + 标记已发送提醒
        await sbFetch('device_login_logs', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
            body: JSON.stringify({
                email,
                device_id,
                ip_address,
                logged_at: now,
                alert_sent: true,
                alert_sent_at: new Date().toISOString()
            })
        });

        return cors({ok: true}, 200, event);
    } catch (e) {
        console.error(e);
        return cors({error: String(e && e.message ? e.message : e)}, 500, event);
    }
};

function htmlEscape (s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate (iso) {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    }).replace(/\//g, '-');
}

function buildAlertEmail (email, time) {
    // Logo base64（从 cat_logo.svg 提取的简化版本）
    const logoB64 = 'PHN2ZyB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHdpZHRoPSI5MC4zMTEyNCIgaGVpZ2h0PSI0MS43ODEzNSIgdmlld0JveD0iMCwwLDkwLjMxMTI0LDQxLjc4MTM1Ij48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTk0Ljg0NDM4LC0xNTkuMTA5MzIpIj48ZyBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIj48cGF0aCBkPSJNMTk1LjMzMTg2LDIwMC44MzQ3Yy0xLjMwNTM3LC0xLjE5MzQ4IDAuMDgxODksLTUuMTU4NjMgMy4zMTE3MywtMTAuNzY0MThjMy40NzYzLC02LjAzMzMxIDguMTY5MjMsLTEwLjAxNjg5IDguMTY5MjMsLTEwLjAxNjg5YzAsMCAtNC41NjIyNCwtNy45NjIzOSAtMS43NjM3MSwtMTAuNTk5MWMxLjc4MzU1LC0xLjY4MDQyIDExLjY3NDM0LDAuOTkyOTkgMTMuNzk2MTIsMS4xMTMwMWMxLjAwNzY5LDAuMDU3IDMuNDI2OTQsLTEuNTYxMjYgNi4wOTE5NCwtMi4yNzIyM2M0LjE2NjYxLC0xLjExMTU3IDcuNjYxNzMtMS4yMDI3MSA4LjI4ODMxLC0xLjY4MzQxYzAuODM5MTIsLTAuNjQzNzUgNC4xNTc5NSwtNy44MzUyNyA2LjMwNiwtNy40OTA1N2M0LjI2MjQ4LDAuNjg0MDEgNy4zOTI4Niw3Ljg3MzM1IDguNDMwODMsNy45OTA5YzAuNzAwMDMsMC4wNzkyOCAzLjg4NjU2LDAuMjQ0ODcgMTAuODE3MywyLjQ4Mjc4YzE0Ljk4NTUzLDQuODM4NzUgMjcuMDA3MDcsMjEuMDUyNDEgMjYuMzUwMzIsMjMuOTY3MThjMC4wMzgzMiwtMC4wMTI0NCAtMC4wMzY1OSwxLjU5NjM0IC0xLjY2NDI3LDEuODY3MDljLTAuNTM5MjEsMC4wODk2OSAtMjEuMDk2ODgsMS43NzczNyAtNDIuMjk4NTksMy4yMTIyNGMtMS4wODc3OCwwLjA3MzYyIC00NS4zMjY0MywyLjY1ODM1IC00NS44MzUyLDIuMTkzMTl6IiBmaWxsPSJ2YXIoLS10dy1sb2dvLWFjY2VudCwgI2Y2NGE0YSkiLz48cGF0aCBkPSJNMjMxLjQxNTI2LDE4NC4zNzEwNGMwLC0zLjEyODY2IDIuNTM2MjksLTUuNjY0OTUgNS42NjQ5NSwtNS42NjQ5NWMzLjEyODY2LDAgNS42NjQ5NiwyLjUzNjI5IDUuNjY0OTYsNS42NjQ5NWMwLDMuMTI4NjYgLTIuNTM2Myw1LjY2NDk2IC01LjY2NDk2LDUuNjY0OTZjLTMuMTI4NjYsMCAtNS42NjQ5NSwtMi41MzYzIC01LjY2NDk1LC01LjY2NDk2eiIgZmlsbD0iI2ZmZmZmZiIvPjxwYXRoIGQ9Ik0yNTMuMTU1ODIsMTg1LjU4NzgyYy0yLjMyMDg0LC0xLjQ5NzM1IC0zLjM1MjQ0LC00LjQ0ODc1IC0yLjE3NzIyLC02LjcxOWMxLjE3NTIxLC0yLjI3MDI1IDQuMzE3OTMsLTIuOTk5NyA2LjYzODc3LC0xLjUwMjM1YzIuMzIwODQsMS40OTczNCAzLjQ1NTMsNC41NTE2MSAyLjI4MDEsNi44MjE4N2MtMS4xNzUyMSwyLjI3MDI1IC00LjQyMDgsMi44OTY4NCAtNi43NDE2NCwxLjM5OTQ4eiIgZmlsbD0iI2ZmZmZmZiIvPjwvZz48L2c+PC9zdmc+';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>TwT 安全提醒</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="padding:28px 24px 20px;border-bottom:1px solid #f0f0f0;">
      <img src="data:image/svg+xml;base64,${logoB64}" alt="TwT" style="height:24px;width:auto;vertical-align:middle;margin-right:6px;">
      <span style="font-size:16px;font-weight:600;color:#1a1a2e;vertical-align:middle;">安全提醒</span>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <p style="margin:0 0 12px;font-size:15px;color:#1a1a2e;line-height:1.6;">
        您好，您的账户 <strong style="color:#4c5cff;">${email}</strong> 刚刚完成了一次新的设备登录。
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.6;">
        如果这是您本人的操作，可以忽略本邮件。<br>
        如果不是您本人操作，请尽快修改密码并联系管理员。
      </p>

      <!-- Info Card -->
      <div style="background:#f8f9fa;border-radius:10px;padding:16px;margin-bottom:20px;">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;color:#555;">
          <tr><td style="padding:4px 0;width:80px;opacity:0.7;">登录时间</td><td style="padding:4px 0;font-weight:600;color:#1a1a2e;">${time}</td></tr>
        </table>
      </div>

      <p style="margin:0 0 24px;font-size:13px;color:#888;line-height:1.6;">
        💡 建议：为保护账户安全，请确保使用强密码并定期更换。
      </p>
    </div>

    <!-- Divider -->
    <div style="border-top:1px solid #f0f0f0;"></div>

    <!-- Footer -->
    <p style="margin:0;padding:16px 24px;font-size:12px;color:#aaa;line-height:1.8;">
      TwT · 让 TurboWarp 更加舒适<br>
      此邮件由系统自动发送，请勿回复
    </p>
  </div>
</body>
</html>`;
}
