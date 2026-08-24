-- ========================================
-- TwT 头像系统完整授权修复（一次性执行）
-- 用途：修复 anon 用户对 usernames.avatar_url 的读取权限 + 确保 set_avatar RPC 存在
-- 风险：幂等设计，可重复执行，不影响现有数据
-- 执行方式：Supabase 控制台 → SQL Editor → New query → 粘贴全段 → Run
-- ========================================

-- ============================================================
-- 第一部分：确保列存在（幂等）
-- ============================================================
ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.usernames ADD COLUMN IF NOT EXISTS avatar_url text;

-- ============================================================
-- 第二部分：修复 usernames 表授权
--    先整表 GRANT，再 REVOKE 敏感列（device_secret），确保匿名可查公开列+头像
-- ============================================================
REVOKE ALL ON public.usernames FROM anon, authenticated;
GRANT SELECT ON public.usernames TO anon, authenticated;
REVOKE SELECT (device_secret) ON public.usernames FROM anon, authenticated;

-- ============================================================
-- 第三部分：修复 feedback 表授权
--    同样先整表，再只 grant 公开列，最后 revoke owner_secret
-- ============================================================
REVOKE ALL ON public.feedback FROM anon, authenticated;
GRANT SELECT (id, name, text, image_urls, likes, comments, created_at, owner_id, likers, status)
  ON public.feedback TO anon, authenticated;
REVOKE SELECT (owner_secret) ON public.feedback FROM anon, authenticated;

-- ============================================================
-- 第四部分：修复 email_sessions 授权
--    注意：email_sessions 没有 password_hash（那列在 email_accounts）
-- ============================================================
REVOKE ALL ON public.email_sessions FROM anon, authenticated;
GRANT SELECT (token, email, device_id, expires_at, created_at)
  ON public.email_sessions TO anon;

-- ============================================================
-- 第五部分：创建 / 更新 set_avatar RPC（幂等）
--    SECURITY DEFINER 保证函数内部以 postgres superuser 身份执行 UPDATE
--    anon 用户只能调用这个函数，不能直连写 email_accounts / usernames
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_avatar(
  p_token text,
  p_avatar_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_device text;
BEGIN
  -- 校验登录态有效（否则抛异常，函数以 SECURITY DEFINER 运行可绕过 RLS）
  SELECT email, device_id INTO v_email, v_device
  FROM public.email_sessions
  WHERE token = p_token AND expires_at > now();

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 参数校验（长度限制 3MB，格式只允许 data URL 或 https URL）
  IF length(coalesce(p_avatar_url, '')) > 3 * 1024 * 1024 THEN
    RAISE EXCEPTION 'avatar_too_large';
  END IF;

  IF p_avatar_url IS NOT NULL AND length(p_avatar_url) > 0
     AND not (p_avatar_url like 'data:image/%' or p_avatar_url like 'https://%') THEN
    RAISE EXCEPTION 'invalid_avatar_format';
  END IF;

  -- 同一事务内同步两张表：
  --   email_accounts.avatar_url  = 私密备份（仅服务端可读）
  --   usernames.avatar_url       = 公开展示（反馈区、菜单栏使用）
  UPDATE public.email_accounts SET avatar_url = p_avatar_url WHERE email = v_email;
  UPDATE public.usernames SET avatar_url = p_avatar_url WHERE device_id = v_device;
END;
$$;

-- 授权 anon 调用（不授权直连写表）
GRANT EXECUTE ON FUNCTION public.set_avatar(text, text) TO anon;

-- ============================================================
-- 验证：返回 OK 标识
-- ============================================================
SELECT 'PATCH_APPLIED_OK' AS status;
