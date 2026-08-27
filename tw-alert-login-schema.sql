-- ============================================================
-- TwT 多设备登录安全提醒
-- 新增 device_login_logs 表用于：
--   1. 记录每次登录，用于"同 IP 短时间不去重发送"判断
--   2. 存储上次已提醒的登录记录 id，避免重复通知
-- ============================================================

create table if not exists public.device_login_logs (
  id bigserial primary key,
  email text not null,
  device_id text not null,
  ip_address text,
  logged_at timestamptz not null default now(),
  alert_sent boolean not null default false,
  alert_sent_at timestamptz
);

create index if not exists device_login_logs_email_idx
  on public.device_login_logs (email);
create index if not exists device_login_logs_device_idx
  on public.device_login_logs (device_id);
create index if not exists device_login_logs_ip_alerted_idx
  on public.device_login_logs (ip_address, logged_at)
  where alert_sent = true;

alter table public.device_login_logs enable row level security;

drop policy if exists "device_login_logs block anon" on public.device_login_logs;
create policy "device_login_logs block anon" on public.device_login_logs
  for all to anon using (false) with check (false);
