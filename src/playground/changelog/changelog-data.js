// 在这里编辑更新日志；按时间倒序排列，最新版本放最前面。
// 每条改动用 { tag, text } 表示：tag 可选 'new'(新增) / 'imp'(改进) / 'fix'(修复) / 'sec'(安全)
// 该模块为单一数据源，同时被「独立页面 changelog.html」与「弹窗」复用。

export const TAG_LABEL = {new: '新增', imp: '改进', fix: '修复', sec: '安全'};

// 每个分类标签对应的图标（内联 SVG 路径，零资源依赖；改这里即可统一调整两处渲染）
// 数值为 24x24 viewBox 下的 path `d`，由各渲染器用 <svg><path> 画出，避免 emoji
export const TAG_ICON = {
    new: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z', // 加号：新增
    imp: 'M12 4l7 7h-4v9h-6v-9H5l7-7z',        // 向上箭头：改进
    fix: 'M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a1.5 1.5 0 0 0 2.1 2.1l6-6a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.1-2.1 2.1-2.1z', // 扳手：修复
    sec: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z' // 盾牌：安全
};

export const CHANGELOG_DATA = [
    {
        version: 'v2026.8.23.1',
        date: '2026 年 8 月 23 日',
        changes: [
            {tag: 'new', text: '真正头像系统上线：usernames / email_accounts 新增 avatar_url 列，set_avatar RPC 单事务同步「公开(反馈区展示)」与「私密(账户备份)」两张副本。'},
            {tag: 'new', text: '反馈区显示头像：帖子作者与评论作者均显示自定义头像（无头像者回退默认人形图标），列表加载时批量拉取作者头像。'},
            {tag: 'new', text: '菜单栏实时显示真实头像：登录态头像不再恒为默认图标，个人中心改完头像后菜单栏同页即时更新（自定义事件 + storage 双通道）。'},
            {tag: 'imp', text: '头像上传成功后广播 twt-avatar-changed 事件，个人中心/菜单栏/反馈区三处全局实时同步，跨标签页由 storage 事件兜底。'}
        ],
        files: {
            modified: [
                'tw-db-schema.sql',
                'netlify/functions/avatar.js',
                'src/lib/tw-auth-store.js',
                'src/lib/tw-feedback-store.js',
                'src/components/menu-bar/tw-save-status.jsx',
                'src/components/tw-feedback-modal/feedback-modal.jsx',
                'src/components/tw-feedback-modal/feedback-modal.css'
            ]
        }
    },
    {
        version: 'v2026.8.23',
        date: '2026 年 8 月 23 日',
        changes: [
            {tag: 'sec', text: '反馈评论鉴权重做：add_comment 要求已注册设备密钥、owner_id 由服务端可信写入；delete_comment 仅帖子作者或评论作者本人可删，杜绝匿名伪造与越权删除。'},
            {tag: 'sec', text: 'feedback 的 status 列并入主结构授权清单，重跑主 SQL 不再丢失列权限（与增量文件解耦）。'},
            {tag: 'sec', text: '图片上传收口到服务端 upload-image 函数：收回 Storage 匿名直传权限，上传须登录、校验真实类型(字节魔数)/大小(≤5MB)/每日每设备上限，杜绝匿名无限上传与绕开审核。'},
            {tag: 'fix', text: '每日发帖上限改为按设备终身 ID 计数（服务端 can_submit_feedback），改名无法再绕过每日 3 条限制。'},
            {tag: 'fix', text: '修复 AI 审核接口路径：yjs.im 端点须带 /chat/completions，此前缺路径导致首发内容审核请求 404/500、前端降级为本地模式。'},
            {tag: 'fix', text: '登录弹窗顶部提示条移出滚动容器，现在恒紧贴弹窗顶栏、不再随内容滚动错位。'}
        ],
        files: {
            modified: [
                'tw-db-schema.sql',
                'tw-admin-role.sql',
                'src/lib/tw-feedback-store.js',
                'src/components/tw-feedback-modal/feedback-modal.jsx',
                'netlify/functions/submit-feedback.js',
                'netlify/functions/_lib/moderation.js',
                'src/components/tw-login-modal/login-modal.jsx',
                'src/components/tw-login-modal/login-modal.css'
            ],
            added: [
                'netlify/functions/upload-image.js'
            ]
        }
    },
    {
        version: 'v2026.8.22',
        date: '2026 年 8 月 22 日',
        changes: [
            {tag: 'new', text: '新增个人中心：头像（悬停上传）、昵称修改（沿用反馈区昵称冷却规则）、注册时间与解除登录。'},
            {tag: 'new', text: '反馈区管理员：指定账户删除任意反馈、标记/撤销「已处理」，所有操作由服务端二次鉴权。'},
            {tag: 'imp', text: '验证码输入步骤不再需要完成人机验证。'},
            {tag: 'imp', text: '弹窗统一按视口高度自适应：内容超长内部滚动，矮窗口自动收紧边距。'},
            {tag: 'fix', text: '个人中心弹窗背景恢复为不透明弹窗底色，解除登录按钮回归原生外观。'}
        ],
        files: {
            modified: [
                'src/components/tw-feedback-modal/feedback-modal.jsx',
                'src/components/tw-feedback-modal/feedback-modal.css',
                'src/components/tw-login-modal/login-modal.jsx',
                'src/components/tw-login-modal/login-modal.css',
                'src/components/tw-profile-center-modal/profile-center-modal.css',
                'src/components/menu-bar/menu-bar.css',
                'src/lib/tw-auth-store.js',
                'src/lib/tw-feedback-store.js',
                'src/lib/tw-translations/generated-translations.json',
                'tw-admin-role.sql'
            ],
            added: [
                'netlify/functions/admin.js',
                'netlify/functions/_lib/admin-auth.js'
            ]
        }
    },
    {
        version: 'v2026.8.20',
        date: '2026 年 8 月 20 日',
        changes: [
            {tag: 'imp', text: '高级设置中移除「AI 审核 API Key」自填项：审核已统一在服务端完成，前端不再需要填写个人 Key。'}
        ],
        files: {
            modified: [
                'src/components/tw-settings-modal/settings-modal.jsx'
            ]
        }
    },
    {
        version: 'v2026.8.19',
        date: '2026 年 8 月 19 日',
        changes: [
            {tag: 'imp', text: 'AI 审核改为服务端代理，接口密钥与审核规则不再出现在网页代码中。'},
            {tag: 'imp', text: '反馈的点赞、评论、删除与改名改为服务端受控处理，匿名用户仅可浏览与发布。'},
            {tag: 'fix', text: '点赞即时反馈：点击即更新计数，稍后由服务端校正。'},
            {tag: 'fix', text: '反馈弹窗隐藏滚动条，提示栏横向铺满。'},
            {tag: 'imp', text: '发布评论新增上滑淡入动画。'},
            {tag: 'sec', text: '修复可任意删除或篡改他人反馈的漏洞：删除与改名改用设备密钥校验，密钥仅存储不公开。'},
            {tag: 'sec', text: '发帖改为服务端统一审核后入库，匿名直连发帖通道已关闭，无法再绕过内容审核；反馈图片桶同时关闭匿名列举。'}
        ],
        files: {
            modified: [
                'src/lib/tw-feedback-store.js',
                'src/components/tw-feedback-modal/feedback-modal.jsx',
                'src/components/tw-feedback-modal/feedback-modal.css',
                'src/playground/changelog/changelog-data.js',
                'tw-db-schema.sql',
                'netlify/functions/moderate.js'
            ],
            added: [
                'netlify/functions/submit-feedback.js',
                'netlify/functions/_lib/moderation.js'
            ]
        }
    },
    {
        version: 'v2026.8.18',
        date: '2026 年 8 月 18 日',
        changes: [
            {tag: 'new', text: '反馈区每条帖子的回复输入框改为点击「评论数」气泡按钮才展开，并加入淡入下滑 / 淡出上滑动画。'},
            {tag: 'fix', text: '主帖 AI 审核服务不可用时不再直接发布，改为拦截并提示稍后重试（与评论行为一致）。'},
            {tag: 'fix', text: 'AI 审核改为浏览器直连硅基流动 SiliconFlow，并区分「未填 Key / Key 无效 / 网络不可达」等失败原因，便于排查。'}
        ],
        files: {
            modified: [
                'src/components/tw-feedback-modal/feedback-modal.jsx',
                'src/lib/tw-feedback-store.js'
            ]
        }
    },
    {
        version: 'v2026.7.29',
        date: '2026 年 7 月 29 日',
        changes: [
            {tag: 'new', text: '设置中新增「AI 审核 API Key」自填项（TwT 服务），填写后反馈区审核改用个人硅基流动 SiliconFlow 额度，未填则无法使用 AI 审核。'}
        ]
    },
    {
        version: 'v2026.7.26',
        date: '2026 年 7 月 26 日',
        changes: [
            {tag: 'fix', text: '将「音频编码器」扩展改为本地同源加载。'}
        ]
    },
    {
        version: 'v2026.7.21',
        date: '2026 年 7 月 21 日',
        changes: [
            {tag: 'new', text: '增加了日志系统'}
        ]
    }
];
