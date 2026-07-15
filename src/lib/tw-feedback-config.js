// TwT 反馈 —— Supabase 配置（与发帖社区使用同一项目）
// 注意：anon / publishable key 已随构建产物分发给用户，与发帖社区一致；
// 真正的安全边界由 Supabase 的 RLS 策略承担（见 tw-feedback-schema.sql）。
const TWF_CONFIG = {
    SUPABASE_URL: 'https://yqqizrnrglihvwxsignr.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_NQeZPNYL72jQYKw9GkPDrw_FJffTB6l'
};

export default TWF_CONFIG;
