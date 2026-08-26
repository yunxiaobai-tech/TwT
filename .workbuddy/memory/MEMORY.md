# TwT 项目长期笔记

基于 TurboWarp（scratch-gui）的改版，React16 + Redux + webpack4。产品名 "TwT - 让TurboWarp更加舒适"。

## 关键约定（务必遵守）
- **更新日志**：每次写完代码，需更新 `src/playground/changelog/changelog-data.js` 的 `CHANGELOG_DATA`（单一数据源，倒序，最新版本在前）。每条 `{version, date, changes:[{tag,text}]}`，tag 可选 `new`(新增)/`imp`(改进)/`fix`(修复)。该数据同时被 `changelog.html` 独立页与播放器页脚「Changelog」弹窗复用。改动过小可不填。语言官方、简洁。
- **功能开发前置沟通**：新增功能前，须告知用户——是否易退回、把握度、功能危害、变化是什么，并明确询问「是否确认继续增加此功能」。

## 入口与架构
- 挂载点：`src/playground/app-target.js`（ReactDOM.render）
- 编辑器入口：`src/playground/editor.jsx` → 输出 `build/editor.html`
- 播放器入口：`src/playground/player.jsx` → 输出 `build/index.html`（首页/作品查看）
- 布局/首页/Footer：`src/playground/render-interface.jsx`（Footer 内联类，仅在 isHomepage 渲染，编辑器界面不显示）
- GUI 容器：`src/containers/gui.jsx` → 组件 `src/components/gui/gui.jsx`（react-tabs：Code/Costumes/Sounds 三标签）
- 库入口：`src/index.js`（导出 GUI 供嵌入）

## 状态管理
- action 与 reducer 同文件共存于 `src/reducers/*.js`（无独立 actions 目录）
- 顶组合：`src/reducers/gui.js`；TwT 专属切片 `src/reducers/tw.js`（framerate/interpolation/username/cloud/description 等）
- 标签页索引：`src/reducers/editor-tab.js`
- 新增全局状态优先加进 `src/reducers/tw.js`，勿新建顶层 reducer

## TwT 已存在的定制（后续开发参考）
- TwT Feedback：`src/components/tw-feedback-modal/` + `src/containers/tw-feedback-modal.jsx` + `src/lib/tw-feedback-*.js`（Supabase + Pollinations AI 审核，devServer 代理 `/tw-ai-proxy`）
- 大量 `tw-*` 前缀组件/容器/Modal（settings/security/username/custom-extension/restore-point/fonts 等）
- 新增「TwT Extension」（src/lib/libraries/extensions/index.jsx，tag 'twt'，Netlify host）
- 菜单栏替换 logo 为 cat_logo.svg，含主题切换 svg
- addon：`twt-project-cache`（快速恢复，重启恢复作品）
- **忘记密码功能**：`src/components/tw-login-modal/login-modal.jsx` + `netlify/functions/reset-password.js` + `netlify/functions/send-code.js`
  - 前端：forgotStep 状态机（none → email → code）
  - 后端：scrypt 哈希 + 重置后踢出所有设备登录态
  - 邮件：SVG logo base64 内联到问候语左侧，6 位验证码独立方框

## 注意点
- 品牌名两处来源：`webpack.config.js` 与 `lib/brand.js` 的 APP_NAME 仍为 'TurboWarp'（遗留值），用户可见标题在 `render-interface.jsx` 与 webpack title 硬编码为 TwT。新增功能涉及品牌文案时需同步。
- 运行：`npm start`（webpack-dev-server）；构建：`npm run build`

## 调试要点（npm start / 验证）
- **dev 端口固定 8601**：`npm start` 报「没过/起不来」绝大多数是 **端口冲突（EADDRINUSE）**——先 `netstat -ano | grep :8601` 看谁占着，杀掉再起。
- **webpack devServer `contentBase: build` 坑**：dev server 会回退到 `build/` 目录里的旧产物。若新代码在页面上看不到，**删掉 `build/` 再重启 `npm start`**，强制它只走内存里重新编译的版本。
- **验证改动要 grep 对 chunk**：编辑器 GUI（含菜单栏 menu-bar、gui.jsx）的代码在 **`editor~embed~fullscreen~player.js`** 里，**不是 `editor.js`**（`editor.js` 是另一个入口 chunk）。用 `curl localhost:8601/js/<chunk> | grep <关键字>` 确认已下发。
- **既有的无害控制台告警**：`Cannot read properties of null (reading 'getState')`，来自 `src/addons/redux.js:40`（scratch-addons 时序：`AddonHooks.appStateStore` 在 addon 初始化时尚为 null）。非本功能引入，页面照常渲染，可忽略。
- **无头验证页面**：`"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-sandbox --user-data-dir=/tmp/xxx --virtual-time-budget=20000 --dump-dom <url>` 可取渲染后 DOM；但本沙箱里该调用偶发退出码 1，失败时改用 bundle grep 验证。

## Supabase / SQL 文件布局（部署权威源）
- 根目录活跃 SQL 仅 **2 个**：`tw-db-schema.sql`（主结构 = A 邮箱登录 + B 反馈系统，建整个库，含已加固的 `add_comment`/`delete_comment` 双鉴权 RPC + `status` 列授权）、`tw-admin-role.sql`（增量：`email_accounts.role` 列 + 把 `yunxiaobai@outlook.com` 设为 admin）。部署只跑这 2 个。
- 旧/不安全版本已归档至 `sql-archive/`（含 `tw-feedback-schema.sql` 废弃且 anon 可直连改/删，以及合并前的 A/B 老副本）。**严禁运行归档文件**，否则会 reintroduce 越权洞。
- 反馈系统安全边界：anon 对 feedback 的 INSERT 已被收回，唯一写入口是 `netlify/functions/submit-feedback.js`（服务端审核后用 service role 直写）；评论写/删走 `tw-feedback-store.js` 的 RPC（须设备密钥）。
- 图片上传已收口：Storage 桶 `feedback-images` 的 anon INSERT 策略已删除，仅 `netlify/functions/upload-image.js`（service role）可写。该函数校验 token→device_id、字节魔数类型、≤5MB、每日每设备上限（计数表 `image_uploads` + `can_upload_image` 函数，封顶 20/天）。前端 `tw-feedback-store.js uploadImage` 改 POST 到 `/.netlify/functions/upload-image`（带 `x-tw-token` 头，二进制原样发）。
- 每日发帖上限改为**按设备终身 ID（owner_id）**计数：服务端 `submit-feedback.js` 从 token 取 `device_id`，调 `can_submit_feedback(submitter_owner_id, p_limit)`；入库 `owner_id` 强制用 token 对应 device_id（忽略客户端传入）。改名无法绕过。
