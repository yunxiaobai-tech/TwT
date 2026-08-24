-- ============================================================
-- TwT 完整数据库结构（可重复执行，不丢数据）
-- 分两部分：
--   A. 邮箱验证码登录 / 注册（email_codes / email_send_logs / email_sessions / email_accounts）
--   B. 反馈系统（feedback / usernames + 受控 RPC + 存储桶 + Realtime）
-- 全部 IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE，
-- 在空库或已有库上均可安全重跑。
-- 执行位置：Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================


-- ============================================================
-- A) 邮箱验证码登录
-- ============================================================

-- A.1 当前有效验证码
create table if not exists public.email_codes (
  email text primary key,
  device_id text not null,
  code text not null,
  attempts int not null default 0,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified boolean not null default false
);

-- A.2 发送日志（限流统计，幂等累积）
create table if not exists public.email_send_logs (
  id bigserial primary key,
  email text not null,
  device_id text not null,
  sent_at timestamptz not null default now()
);
create index if not exists email_send_logs_email_sent_idx on public.email_send_logs (email, sent_at);
create index if not exists email_send_logs_device_sent_idx on public.email_send_logs (device_id, sent_at);

-- A.3 登录态 token
create table if not exists public.email_sessions (
  token text primary key,
  email text not null,
  device_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists email_sessions_email_idx on public.email_sessions (email);
create index if not exists email_sessions_device_idx on public.email_sessions (device_id);

-- A.4 邮箱账户表（与 register.js / login.js 严格一致：email / password_hash / verified / created_at）
create table if not exists public.email_accounts (
  email text primary key,
  password_hash text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
-- 兜底补列：若表已存在但结构不对，自动修正为 4 列
alter table public.email_accounts add column if not exists password_hash text not null default '';
alter table public.email_accounts add column if not exists verified boolean not null default false;
alter table public.email_accounts add column if not exists created_at timestamptz not null default now();
alter table public.email_accounts drop column if exists device_id;
alter table public.email_accounts drop column if exists name;
-- 头像（base64 data URL，账户级备份；反馈区显示用 usernames.avatar_url 副本）
alter table public.email_accounts add column if not exists avatar_url text;

-- A.5 开启 RLS
alter table public.email_codes enable row level security;
alter table public.email_send_logs enable row level security;
alter table public.email_sessions enable row level security;
alter table public.email_accounts enable row level security;

-- A.6 清理旧策略
drop policy if exists "email_codes block anon" on public.email_codes;
drop policy if exists "email_send_logs block anon" on public.email_send_logs;
drop policy if exists "email_sessions block anon" on public.email_sessions;
drop policy if exists "email_accounts block anon" on public.email_accounts;

-- A.7 阻止 anon 直连（Functions 用 service_role 绕过 RLS）
create policy "email_codes block anon" on public.email_codes for all to anon using (false) with check (false);
create policy "email_send_logs block anon" on public.email_send_logs for all to anon using (false) with check (false);
create policy "email_sessions block anon" on public.email_sessions for all to anon using (false) with check (false);
create policy "email_accounts block anon" on public.email_accounts for all to anon using (false) with check (false);


-- ============================================================
-- B) 反馈系统
-- ============================================================

drop table if exists public.feedback_reports;

-- B.1 反馈表
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null default '匿名',
  text text,
  image_urls jsonb not null default '[]'::jsonb,
  likes integer not null default 0,
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  owner_id text,
  likers jsonb not null default '[]'::jsonb,
  owner_secret text
);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
-- 兜底补列
alter table public.feedback add column if not exists likers jsonb not null default '[]'::jsonb;
alter table public.feedback add column if not exists owner_secret text;
-- 管理员「标记已处理」状态列：并入主结构，避免依赖独立增量文件（重跑主结构也不会丢授权）
alter table public.feedback add column if not exists status text not null default 'normal';

-- B.1.1 头像：公开级（反馈区展示），存于 usernames；私密副本存于 email_accounts（跨设备同步）
-- 公开列匿名可读，私密副本仅服务端 service_role 可写，anon 不可见
alter table public.usernames add column if not exists avatar_url text;
alter table public.email_accounts add column if not exists avatar_url text;

-- B.2 用户名表
create table if not exists public.usernames (
  device_id text primary key,
  name text unique not null,
  created_at timestamptz not null default now(),
  name_updated_at timestamptz not null default now(),
  device_secret text
);
alter table public.usernames add column if not exists device_secret text;
alter table public.usernames add column if not exists avatar_url text;

-- B.3 开启 RLS
alter table public.feedback enable row level security;
alter table public.usernames enable row level security;

-- B.4 每日上限函数（发帖服务端 submit-feedback 用，以服务端为准）
-- 按 owner_id（设备终身ID）计数：改名无法绕过每日上限
create or replace function public.can_submit_feedback(submitter_owner_id text, p_limit int default 3)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(count(*) < p_limit, true)
  from public.feedback
  where owner_id = submitter_owner_id
    and created_at >= date_trunc('day', now());
$$;

-- B.5 改名冷却触发器
create or replace function public.enforce_username_cooldown()
returns trigger
language plpgsql
as $$
begin
  if NEW.name is distinct from OLD.name then
    if OLD.name_updated_at > now() - interval '45 days' then
      raise exception 'username change cooldown: % days remaining',
        ceil(extract(epoch from (OLD.name_updated_at + interval '45 days' - now())) / 86400);
    end if;
    NEW.name_updated_at = now();
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_username_cooldown on public.usernames;
create trigger trg_username_cooldown before update on public.usernames
  for each row execute function public.enforce_username_cooldown();

-- B.6 受控写 RPC（SECURITY DEFINER，anon 仅可执行、不可直连改表）

-- 点赞 / 取消赞
create or replace function public.set_like(p_id uuid, p_device text, p_liked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already boolean;
begin
  select coalesce(likers, '[]'::jsonb) ? p_device into v_already
  from public.feedback where id = p_id;
  if p_liked and not v_already then
    update public.feedback set likes = likes + 1,
      likers = coalesce(likers, '[]'::jsonb) || jsonb_build_array(p_device)
      where id = p_id;
  elsif not p_liked and v_already then
    update public.feedback set likes = greatest(0, likes - 1),
      likers = (select coalesce(jsonb_agg(x), '[]'::jsonb)
                from jsonb_array_elements(coalesce(likers, '[]'::jsonb)) x
                where x <> to_jsonb(p_device))
      where id = p_id;
  end if;
end;
$$;

-- 评论：仅追加（必须持有已注册设备的密钥，且归属以服务端校验的设备ID为准，杜绝伪造身份刷评论）
drop function if exists public.add_comment(uuid, jsonb);
create or replace function public.add_comment(p_id uuid, p_comment jsonb, p_device text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 评论者必须已在 usernames 注册且设备密钥匹配（密钥对 anon 不可读，无法伪造）
  if not exists (
    select 1 from public.usernames
    where device_id = p_device and device_secret = p_secret
  ) then
    raise exception 'unauthorized comment';
  end if;
  -- 服务端以可信设备ID覆盖评论归属，客户端传入的 owner_id 不可信
  update public.feedback
    set comments = coalesce(comments, '[]'::jsonb) || jsonb_set(p_comment, '{owner_id}', to_jsonb(p_device))
    where id = p_id;
end;
$$;

-- 删除单条评论：仅「帖子作者(owner_secret)」或「该评论作者(本人设备密钥)」可删，杜绝越权删除他人评论
drop function if exists public.delete_comment(uuid, jsonb);
create or replace function public.delete_comment(
  p_id uuid,
  p_comment jsonb,
  p_secret text,        -- 帖子作者密钥（删他人评论用）
  p_device text,        -- 调用方设备ID（删自己评论用）
  p_device_secret text  -- 调用方设备密钥（删自己评论用）
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_secret text;
  v_comment_owner text;
begin
  select owner_secret into v_owner_secret from public.feedback where id = p_id;
  v_comment_owner := p_comment ->> 'owner_id';

  -- 情况1：帖子作者凭帖子密钥删除任意评论
  if v_owner_secret is not null and v_owner_secret = p_secret then
    update public.feedback set comments = (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from jsonb_array_elements(coalesce(comments, '[]'::jsonb)) x
      where x <> p_comment
    ) where id = p_id;
    return;
  end if;

  -- 情况2：评论作者凭本人设备密钥删除自己那条评论（设备ID须与评论归属一致）
  if v_comment_owner is not null and v_comment_owner = p_device and exists (
    select 1 from public.usernames
    where device_id = p_device and device_secret = p_device_secret
  ) then
    update public.feedback set comments = (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from jsonb_array_elements(coalesce(comments, '[]'::jsonb)) x
      where x <> p_comment
    ) where id = p_id;
    return;
  end if;

  -- 均不满足：静默不操作（防越权删除）
end;
$$;

-- 删除自己的帖：以密钥(owner_secret)鉴权
drop function if exists public.delete_own_feedback(uuid, text);
create or replace function public.delete_own_feedback(p_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.feedback where id = p_id and owner_secret = p_secret;
end;
$$;

-- 改名：以密钥(device_secret)鉴权
drop function if exists public.rename_username(text, text);
create or replace function public.rename_username(p_device text, p_name text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usernames set name = p_name where device_id = p_device and device_secret = p_secret;
end;
$$;

-- 设置头像：仅服务端调用（不 grant anon），以登录态 token 鉴权
-- 同一事务内同步更新 email_accounts（私密/跨设备）与 usernames（公开/反馈区展示）
create or replace function public.set_avatar(p_token text, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_device text;
begin
  -- 校验登录态有效
  select email, device_id into v_email, v_device
  from public.email_sessions
  where token = p_token and expires_at > now();
  if v_email is null then
    raise exception 'unauthorized';
  end if;
  -- 头像大小限制（服务端兜底，与前端 2MB 一致）
  if length(coalesce(p_avatar_url, '')) > 3 * 1024 * 1024 then
    raise exception 'avatar_too_large';
  end if;
  -- 只允许 data URL 或 https URL
  if p_avatar_url is not null and length(p_avatar_url) > 0
     and not (p_avatar_url like 'data:image/%' or p_avatar_url like 'https://%') then
    raise exception 'invalid_avatar_format';
  end if;
  update public.email_accounts set avatar_url = p_avatar_url where email = v_email;
  update public.usernames set avatar_url = p_avatar_url where device_id = v_device;
end;
$$;

grant execute on function public.set_like(uuid, text, boolean) to anon;
grant execute on function public.add_comment(uuid, jsonb, text, text) to anon;
grant execute on function public.delete_comment(uuid, jsonb, text, text, text) to anon;
grant execute on function public.delete_own_feedback(uuid, text) to anon;
grant execute on function public.rename_username(text, text, text) to anon;
grant execute on function public.set_avatar(text, text) to anon;

-- B.7 清理旧策略
drop policy if exists "feedback read" on public.feedback;
drop policy if exists "feedback update" on public.feedback;
drop policy if exists "feedback delete" on public.feedback;
drop policy if exists "feedback insert" on public.feedback;
drop policy if exists "usernames read" on public.usernames;
drop policy if exists "usernames insert" on public.usernames;
drop policy if exists "usernames update" on public.usernames;
drop policy if exists "feedback images read" on storage.objects;
drop policy if exists "feedback images insert" on storage.objects;

-- B.8 新策略：anon 仅 读 + 建昵称（发帖走服务端 submit-feedback，收回 feedback insert 直连）
create policy "feedback read" on public.feedback for select to anon using (true);
create policy "usernames read" on public.usernames for select to anon using (true);
create policy "usernames insert" on public.usernames for insert to anon with check (true);

-- 关键：收回 anon 对密钥列的读取权（函数以 SECURITY DEFINER 运行仍可读）
revoke select on public.feedback from anon, authenticated;
grant select (id, name, text, image_urls, likes, comments, created_at, owner_id, likers, status)
  on public.feedback to anon, authenticated;

revoke select on public.usernames from anon, authenticated;
grant select (device_id, name, created_at, name_updated_at, avatar_url)
  on public.usernames to anon, authenticated;

-- 允许 anon 插入 usernames 时写入密钥列（读取仍被禁止）
revoke insert on public.feedback from anon, authenticated;
grant insert (device_id, name, device_secret) on public.usernames to anon, authenticated;

-- B.9 图片存储桶
insert into storage.buckets (id, name, public)
  values ('feedback-images', 'feedback-images', true)
  on conflict (id) do update set public = true;

create policy "feedback images read" on storage.objects for select to anon using (bucket_id = 'feedback-images');
-- 收回 anon 直传：图片改由服务端 upload-image 函数（service_role）写入，杜绝匿名无限上传
-- （service_role 默认绕过 RLS，无需额外授权即可写入 storage.objects）

-- B.9.1 图片上传限流计数（仅服务端写入，anon 不可见/不可写）
create table if not exists public.image_uploads (
  id bigserial primary key,
  device_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists image_uploads_device_created_idx on public.image_uploads (device_id, created_at);
alter table public.image_uploads enable row level security;
drop policy if exists "image_uploads block anon" on public.image_uploads;
create policy "image_uploads block anon" on public.image_uploads for all to anon using (false) with check (false);

-- 每日每设备上传上限（与 upload-image.js 的 DAILY_LIMIT 保持一致）
create or replace function public.can_upload_image(p_device text, p_limit int default 20)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(count(*) < p_limit, true)
  from public.image_uploads
  where device_id = p_device
    and created_at >= date_trunc('day', now());
$$;
grant execute on function public.can_upload_image(text, int) to anon;

-- B.10 开启 Realtime
do $$
begin
  alter publication supabase_realtime add table public.feedback;
exception
  when duplicate_object then null;
end $$;
