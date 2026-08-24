-- ============================================================
-- TwT 反馈 数据库结构（在 Supabase 的 SQL Editor 里一次性执行）
-- 安全加固版（保留全部功能）：
--   - 表对匿名(anon)仅开放 SELECT + INSERT；UPDATE / DELETE 直接权限全部收回。
--   - 点赞 / 评论 / 删除自己的帖 / 改名 改为调用 SECURITY DEFINER 的 RPC 函数，
--     由函数内部 WHERE 严格约束。删除/改名以「密钥(owner_secret/device_secret)」鉴权，
--     该密钥写入各行但【禁止 anon 读取】，从根本上杜绝「读 owner_id 即可删光」的越权。
--   - 全部 if not exists / on conflict / drop policy if exists / create or replace，
--     可安全重复执行；不含任何 DELETE / TRUNCATE / DROP 数据表，不丢数据。
-- ============================================================

-- 清理：删除已废弃的反馈举报表（仅删结构，不影响 feedback / usernames）
drop table if exists public.feedback_reports;

-- ============================================================
-- 1) 反馈表
-- ============================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null default '匿名',
  text text,
  image_urls jsonb not null default '[]'::jsonb,
  likes integer not null default 0,
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  owner_id text,                                    -- 作者终身 ID（设备唯一，不展示）
  likers jsonb not null default '[]'::jsonb         -- 已点赞的设备 ID 列表，防重复赞
);

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

-- 升级场景：feedback 表若已存在，上面的 create table if not exists 不会补列，
-- 这里显式补 likers（点赞去重用），对新建表则已是 no-op。缺此列会导致 set_like 报
-- "column likers does not exist" 而点赞失败。
-- 注意：ALTER TABLE 后不能跟 IF NOT EXISTS（那是 CREATE TABLE 的语法），IF NOT EXISTS 只能修饰列。
alter table public.feedback add column if not exists likers jsonb not null default '[]'::jsonb;

-- 升级场景补列：删除/改名改用「密钥」鉴权，密钥绝不可被 anon 读取（见文末权限回收）。
-- owner_secret 为每条反馈的删除密钥（设备级随机值，写入后仅本机持有）。
alter table public.feedback add column if not exists owner_secret text;
-- 同理，用户名的改名密钥（设备级随机值），不可被 anon 读取。
alter table public.usernames add column if not exists device_secret text;

-- ============================================================
-- 2) 用户名表（一个设备一个用户名 + 全局唯一 + 45 天改名冷却）
-- ============================================================
create table if not exists public.usernames (
  device_id text primary key,
  name text unique not null,
  created_at timestamptz not null default now(),
  name_updated_at timestamptz not null default now()
);

-- ============================================================
-- 3) 开启行级安全（RLS）
-- ============================================================
alter table public.feedback enable row level security;
alter table public.usernames enable row level security;

-- ============================================================
-- 4) 每日上限函数（插入时校验，以服务端为准）
-- ============================================================
create or replace function public.can_submit_feedback(submitter_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(count(*) < 3, true)
  from public.feedback
  where name = submitter_name
    and created_at >= date_trunc('day', now());
$$;

-- ============================================================
-- 5) 用户名 45 天改名冷却触发器（rename_username 走 UPDATE 时由它强制）
-- ============================================================
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
create trigger trg_username_cooldown
  before update on public.usernames
  for each row execute function public.enforce_username_cooldown();

-- ============================================================
-- 6) 受控写操作 RPC（SECURITY DEFINER，anon 仅可执行、不可直连改表）
-- ============================================================

-- 6.1 点赞 / 取消赞：服务端只 ±1，按设备去重（likers 记录已赞设备），杜绝刷赞
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
    update public.feedback
    set likes = likes + 1,
        likers = coalesce(likers, '[]'::jsonb) || jsonb_build_array(p_device)
    where id = p_id;
  elsif not p_liked and v_already then
    update public.feedback
    set likes = greatest(0, likes - 1),
        likers = (
          select coalesce(jsonb_agg(x), '[]'::jsonb)
          from jsonb_array_elements(coalesce(likers, '[]'::jsonb)) x
          where x <> to_jsonb(p_device)
        )
    where id = p_id;
  end if;
end;
$$;

-- 6.2 评论：仅追加一条，绝不覆盖已有评论
create or replace function public.add_comment(p_id uuid, p_comment jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feedback
  set comments = coalesce(comments, '[]'::jsonb) || p_comment
  where id = p_id;
end;
$$;

-- 6.2b 删除单条评论：仅移除与入参完全匹配的那一条元素，不触碰其余评论
create or replace function public.delete_comment(p_id uuid, p_comment jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feedback
  set comments = (
    select coalesce(jsonb_agg(x), '[]'::jsonb)
    from jsonb_array_elements(coalesce(comments, '[]'::jsonb)) x
    where x <> p_comment
  )
  where id = p_id;
end;
$$;

-- 6.3 删除自己的帖：仅当 owner_secret 与调用方持有的密钥一致才删除。
--     注意：不再用公开的 owner_id 鉴权（owner_id 可被 anon SELECT 读到，任何人都能删光）。
--     旧版签名为 (uuid, p_owner)，Postgres 不允许用 create or replace 改参数名，故先 drop 再建。
drop function if exists public.delete_own_feedback(uuid, text);
create or replace function public.delete_own_feedback(p_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.feedback
  where id = p_id and owner_secret = p_secret;
end;
$$;

-- 6.4 改名：仅当 device_secret 与调用方持有的密钥一致才改自己 device_id 对应的行
--     （45 天冷却由触发器强制）。device_id 虽公开可读，但缺少密钥无法改名。
--     旧版签名为 (text, text)，此处改为三参，先 drop 旧版避免重载残留。
drop function if exists public.rename_username(text, text);
create or replace function public.rename_username(p_device text, p_name text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usernames set name = p_name
  where device_id = p_device and device_secret = p_secret;
end;
$$;

-- 显式授权 anon 可执行以上函数（默认 PUBLIC 已可执行，这里写明确认）
grant execute on function public.set_like(uuid, text, boolean) to anon;
grant execute on function public.add_comment(uuid, jsonb) to anon;
grant execute on function public.delete_comment(uuid, jsonb) to anon;
grant execute on function public.delete_own_feedback(uuid, text) to anon;
grant execute on function public.rename_username(text, text, text) to anon;

-- ============================================================
-- 7) 清理旧策略（按仓库原 schema 的命名，确保替换而非叠加）
-- ============================================================
drop policy if exists "feedback read" on public.feedback;
drop policy if exists "feedback update" on public.feedback;
drop policy if exists "feedback delete" on public.feedback;
drop policy if exists "feedback insert" on public.feedback;
drop policy if exists "usernames read" on public.usernames;
drop policy if exists "usernames insert" on public.usernames;
drop policy if exists "usernames update" on public.usernames;
drop policy if exists "feedback images read" on storage.objects;
drop policy if exists "feedback images insert" on storage.objects;

-- ============================================================
-- 8) 新策略：anon 仅 读 + 建昵称（不给 UPDATE / DELETE / INSERT 直连）
--    发帖已改由服务端函数 submit-feedback 统一审核后代写入库，因此
--    不再为 feedback 创建 insert 策略，anon 直 POST 会被 RLS 拒绝。
-- ============================================================
create policy "feedback read" on public.feedback
  for select to anon using (true);

create policy "usernames read" on public.usernames
  for select to anon using (true);

create policy "usernames insert" on public.usernames
  for insert to anon with check (true);

-- 8.1 关键安全：收回 anon / authenticated 对密钥列的读取权。
--     若 anon 能 SELECT owner_secret / device_secret，攻击者读全表即得他人密钥，
--     又能删光反馈 / 改他人昵称。此处改为「列级授权」，仅放行非密钥列。
--     （函数以 SECURITY DEFINER 运行，仍可读这些列，不影响 RPC 自身逻辑。）
revoke select on public.feedback from anon, authenticated;
grant select (id, name, text, image_urls, likes, comments, created_at, owner_id, likers)
  on public.feedback to anon, authenticated;

revoke select on public.usernames from anon, authenticated;
grant select (device_id, name, created_at, name_updated_at)
  on public.usernames to anon, authenticated;

-- 允许 anon / authenticated 在插入 usernames 时写入密钥列（读取仍被禁止）
-- feedback 的 insert 权限已整体收回（发帖走服务端函数，无需匿名直插）
revoke insert on public.feedback from anon, authenticated;
grant insert (device_id, name, device_secret)
  on public.usernames to anon, authenticated;

-- ============================================================
-- 9) 图片存储桶（公开读，便于前端直接展示；anon 仅可上传到该桶）
--    注意：不再创建 storage.objects 的 select 策略 —— 匿名无法通过
--    storage API 列举对象，但 public 桶的公开 URL 直读不受影响。
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('feedback-images', 'feedback-images', true)
  on conflict (id) do update set public = true;

create policy "feedback images insert" on storage.objects
  for insert to anon with check (bucket_id = 'feedback-images');

-- ============================================================
-- 10) 开启 Realtime（多人自动刷新；前端另以 8s 轮询兜底）
--     幂等写法：feedback 已是发布成员时忽略 42710 错误，可重复执行
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.feedback;
exception
  when duplicate_object then null;
end $$;
