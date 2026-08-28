-- TwT 管理员角色增量 SQL（可重复执行，不丢数据）
-- 仅做两件事：
--   1) 给 email_accounts 增加 role 列（'user' 普通用户 / 'admin' 管理员）
--   2) 把指定邮箱设为管理员
-- 说明：feedback 的 status 列已并入主结构 tw-db-schema.sql（含列级读取授权），
--       本文件不再处理，避免重复执行时因依赖顺序出错。
-- 执行位置：Supabase 控制台 → SQL Editor → New query → 粘贴 → Run

-- 1) email_accounts 加 role 列
alter table public.email_accounts
  add column if not exists role text not null default 'user';

-- 2) 把指定邮箱设为管理员（把下面的邮箱换成你自己的注册邮箱再执行）
update public.email_accounts set role = 'admin' where email = 'fei911@163.com';
