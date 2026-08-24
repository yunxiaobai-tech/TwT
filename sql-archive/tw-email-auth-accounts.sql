-- ============================================================
-- TwT 邮箱账户表（邮箱 + 密码哈希，用于「邮箱+密码」登录）
-- 配合已存在的 email_codes / email_send_logs / email_sessions 使用。
-- 注册流程：邮箱+密码+用户名 → 发验证码(email_codes) → 校验通过 →
--           写 email_accounts(verified=true) + 写 usernames(本机 device 昵称) + 发登录态。
-- 登录流程：邮箱+密码 → 校验 password_hash → 发登录态。
-- 密码使用 scrypt 哈希存储，明文绝不入库；anon 被 RLS 策略阻止直连读取。
-- 可重复执行，不丢数据。
-- ============================================================

-- 4) 邮箱账户表（密码哈希）
create table if not exists public.email_accounts (
  email text primary key,
  password_hash text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists email_accounts_verified_idx
  on public.email_accounts (verified);

-- 开启 RLS，禁止 anon 直连（Functions 使用 service_role 绕过 RLS 读写）
alter table public.email_accounts enable row level security;

-- 清理旧策略（防止重复执行时叠加）
drop policy if exists "email_accounts block anon" on public.email_accounts;

-- 显式阻止 anon 所有操作（service_role/postgres 仍不受影响）
create policy "email_accounts block anon" on public.email_accounts
  for all to anon using (false) with check (false);
