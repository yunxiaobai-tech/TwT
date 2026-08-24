-- ============================================================
-- TwT 邮箱验证码登录 数据库结构
-- 作用：存储验证码、发送日志、登录态 token；仅 Netlify Functions（service_role）可读写。
-- 说明：
--   - email_codes 按 email 主键保存当前有效验证码，每次发送覆盖旧码。
--   - email_send_logs 记录每次发送，用于限流统计（按邮箱 / 按设备 / 按天）。
--   - email_sessions 保存登录态 token。
--   - 开启 RLS 后无允许 anon 的策略，因此匿名用户无法直连读写，只能通过 Functions。
-- 可重复执行，不丢数据。
-- ============================================================

-- 1) 当前有效验证码
 create table if not exists public.email_codes (
   email text primary key,
   device_id text not null,
   code text not null,
   attempts int not null default 0,
   sent_at timestamptz not null default now(),
   expires_at timestamptz not null,
   verified boolean not null default false
 );

-- 2) 发送日志（用于限流统计，幂等累积不清理）
 create table if not exists public.email_send_logs (
   id bigserial primary key,
   email text not null,
   device_id text not null,
   sent_at timestamptz not null default now()
 );

 create index if not exists email_send_logs_email_sent_idx
   on public.email_send_logs (email, sent_at);
 create index if not exists email_send_logs_device_sent_idx
   on public.email_send_logs (device_id, sent_at);

-- 3) 登录态 token
 create table if not exists public.email_sessions (
   token text primary key,
   email text not null,
   device_id text not null,
   created_at timestamptz not null default now(),
   expires_at timestamptz not null
 );

 create index if not exists email_sessions_email_idx
   on public.email_sessions (email);
 create index if not exists email_sessions_device_idx
   on public.email_sessions (device_id);

-- 4) 开启 RLS，禁止 anon 直连（Functions 使用 service_role 绕过 RLS）
 alter table public.email_codes enable row level security;
 alter table public.email_send_logs enable row level security;
 alter table public.email_sessions enable row level security;

-- 5) 清理旧策略（防止重复执行时叠加）
 drop policy if exists "email_codes block anon" on public.email_codes;
 drop policy if exists "email_send_logs block anon" on public.email_send_logs;
 drop policy if exists "email_sessions block anon" on public.email_sessions;

-- 6) 显式阻止 anon 所有操作（service_role/postgres 仍不受影响）
 create policy "email_codes block anon" on public.email_codes
   for all to anon using (false) with check (false);
 create policy "email_send_logs block anon" on public.email_send_logs
   for all to anon using (false) with check (false);
 create policy "email_sessions block anon" on public.email_sessions
   for all to anon using (false) with check (false);
