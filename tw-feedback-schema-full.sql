-- ============================================================
-- TwT 反馈 数据库结构（在 Supabase 的 SQL Editor 里一次性执行）
-- 已【移除举报功能】，本文件回到原始状态（无任何 feedback_reports / 审核相关结构）。
-- 说明：
--   1. 全部使用 if not exists / on conflict / drop policy if exists，可安全重复执行。
--   2. 刻意【不含】任何 DELETE / TRUNCATE / DROP 数据表，不会清空现有反馈/用户名数据。
--   3. 顶部一段“清理举报表”仅删除已废弃的 feedback_reports（如你没建过会自动跳过）。
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
  owner_id text                                     -- 作者终身 ID（设备唯一，不展示）
);

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback read" on public.feedback;
create policy "feedback read"
  on public.feedback for select
  using (true);

drop policy if exists "feedback update" on public.feedback;
create policy "feedback update"
  on public.feedback for update
  using (true) with check (true);

drop policy if exists "feedback delete" on public.feedback;
create policy "feedback delete"
  on public.feedback for delete
  using (true);

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

-- 幂等写法：feedback 已是发布成员时忽略 42710 错误，可重复执行
do $$
begin
  alter publication supabase_realtime add table public.feedback;
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- 2) 图片存储桶（公开读，便于前端直接展示）
-- ============================================================
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
-- 3) 用户名表（一个设备一个用户名 + 全局唯一 + 45 天改名冷却）
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
