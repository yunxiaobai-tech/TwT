-- 反馈区头像生效补丁：usernames 的 avatar_url 需对 anon 可读（公开头像展示用）
-- 在 Supabase 控制台 → SQL Editor 粘贴执行即可（不破坏已有数据）

revoke select on public.usernames from anon, authenticated;
grant select (device_id, name, created_at, name_updated_at, avatar_url)
  on public.usernames to anon, authenticated;
