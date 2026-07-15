-- ============================================================
-- TwT 反馈 数据库结构（在 Supabase 的 SQL Editor 里一次性执行）
-- 项目：https://yqqizrnrglihvwxsignr.supabase.co
-- ============================================================

-- 1) 反馈表
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null default '匿名',
  text text,
  image_urls jsonb not null default '[]'::jsonb,
  likes integer not null default 0,
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 2) 开启行级安全
alter table public.feedback enable row level security;

-- 3) 任何人可读
drop policy if exists "feedback read" on public.feedback;
create policy "feedback read"
  on public.feedback for select
  using (true);

-- 4) 任何人可改（点赞/评论需要由任意访客更新，沿用发帖社区的设计）
drop policy if exists "feedback update" on public.feedback;
create policy "feedback update"
  on public.feedback for update
  using (true) with check (true);

-- 5) 任何人可删（前端仅对“我发的”显示删除按钮；无登录体系下的简化取舍）
drop policy if exists "feedback delete" on public.feedback;
create policy "feedback delete"
  on public.feedback for delete
  using (true);

-- 6) 每日上限：同一昵称当天最多 3 条
--    用 SECURITY DEFINER 函数绕过 RLS 进行全量计数（以服务端为准）
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

drop policy if exists "feedback insert" on public.feedback;
create policy "feedback insert"
  on public.feedback for insert
  with check (public.can_submit_feedback(name));

-- 7) 开启 Realtime（多人自动刷新；前端另以 8s 轮询兜底）
--    幂等写法：feedback 已是发布成员时忽略 42710 错误，可重复执行
do $$
begin
  alter publication supabase_realtime add table public.feedback;
exception
  when duplicate_object then null;
end $$;

-- 8) 图片存储桶（公开读，便于前端直接展示）
insert into storage.buckets (id, name, public)
  values ('feedback-images', 'feedback-images', true)
  on conflict (id) do update set public = true;

drop policy if exists "feedback images read" on storage.objects;
create policy "feedback images read"
  on storage.objects for select
  using (bucket_id = 'feedback-images');

drop policy if exists "feedback images insert" on storage.objects;
create policy "feedback images insert"
  on storage.objects for insert
  with check (bucket_id = 'feedback-images');

-- ============================================================
-- 9) 用户名表（一个设备一个用户名 + 全局唯一 + 45 天改名冷却）
-- ============================================================
create table if not exists public.usernames (
  device_id text primary key,
  name text unique not null,
  created_at timestamptz not null default now(),
  name_updated_at timestamptz not null default now()
);

alter table public.usernames enable row level security;

drop policy if exists "usernames read" on public.usernames;
create policy "usernames read"
  on public.usernames for select
  using (true);

drop policy if exists "usernames insert" on public.usernames;
create policy "usernames insert"
  on public.usernames for insert
  with check (true);

drop policy if exists "usernames update" on public.usernames;
create policy "usernames update"
  on public.usernames for update
  using (true) with check (true);

-- 服务端强制 45 天改名冷却：改名时若距上次不足 45 天则抛错，否则刷新 name_updated_at
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
-- 10) 反馈表增加「作者终身 ID」列（用于“只能删自己发的”）
--     owner_id 即设备唯一标识 device_id（见前端 getDeviceId）：昵称可改、ID 不变、不展示。
--     发帖时写入；删除时比对 owner_id 与当前设备是否一致。
--     升级前的老数据 owner_id 为空，前端按“不可删”处理（一般已先清空旧帖）。
-- ============================================================
alter table public.feedback add column if not exists owner_id text;

-- ============================================================
-- 说明
--  - 前端“每天最多 3 条”同时做客户端限制（按昵称+当天计数，禁用提交按钮），
--    并以本 SQL 的 can_submit_feedback() 作为服务端硬性上限，绕过客户端也不行。
--  - 时间口径：客户端按浏览器本地“今天 0 点”计算；服务端按 UTC 的 date_trunc('day', now())。
--    两者略有偏移，但服务端上限才是最终权威。
--  - 用户名表（第 9 节）无需改动：终身 ID 直接复用 device_id（usernames 的主键），
--    无需另建 user_id 列。
--  - anon key 随编辑器分发给所有用户，安全边界完全由以上 RLS 策略承担。
--    删除权限在“无登录体系”下由前端 owner_id 校验把关（UI 只对自己发的显示删除按钮，
--    且 onDelete 二次比对 owner_id）；服务端 feedback delete 策略保持 using(true) 以便前端可删。
-- ============================================================
