// TwT 邮箱账户登录/注册弹窗
// 登录：邮箱 + 密码
// 注册：邮箱 + 密码 + 初始用户名 → 发验证码 → 校验通过后建账户
// 支持 embedded 模式：不包外层 Modal，可直接嵌进其他弹窗（如反馈弹窗同意公约后）。
// 自带中/英文切换（lang 状态）+ 标题右侧 logo。

import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import {sendCode, register, login, getSession, resetPassword} from '../../lib/tw-auth-store.js';
import styles from './login-modal.css';

const CODE_LENGTH = 6;
const COOLDOWN_SECONDS = 60;
const PASSWORD_MIN = 6;
const TURNSTILE_SITE_KEY = '0x4AAAAAAEXShsRjYJw1Q-py'; // Cloudflare Turnstile 站点公钥（公开，仅前端用）

// 标题右侧 logo（用户指定 SVG）
const LOGO_SVG = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="90.31124" height="41.78135" viewBox="0,0,90.31124,41.78135"><g transform="translate(-194.84438,-159.10932)"><g stroke="none" stroke-width="0" stroke-miterlimit="10"><path d="M195.33186,200.8347c-1.30537,-1.19348 0.08189,-5.15863 3.31173,-10.76418c3.4763,-6.03331 8.16923,-10.01689 8.16923,-10.01689c0,0 -4.56224,-7.96239 -1.76371,-10.59911c1.78355,-1.68042 11.67434,0.99299 13.79612,1.11301c1.00769,0.057 3.42694,-1.56126 6.09194,-2.27223c4.16661,-1.11157 7.66173,-1.20271 8.28831,-1.68341c0.83912,-0.64375 4.15795,-7.83527 6.306,-7.49057c4.26248,0.68401 7.39286,7.87335 8.43083,7.9909c0.70003,0.07928 3.88656,0.24487 10.8173,2.48278c14.98553,4.83875 27.00707,21.05241 26.35032,23.96718c0.03832,-0.01244 -0.03659,1.59634 -1.66427,1.86709c-0.53921,0.08969 -21.09688,1.77737 -42.29859,3.21224c-1.08778,0.07362 -45.32643,2.65835 -45.8352,2.19319z" fill="var(--tw-logo-accent, #f64a4a)"/><path d="M231.41526,184.37104c0,-3.12866 2.53629,-5.66495 5.66495,-5.66495c3.12866,0 5.66496,2.53629 5.66496,5.66495c0,3.12866 -2.5363,5.66496 -5.66496,5.66496c-3.12866,0 -5.66495,-2.5363 -5.66495,-5.66496z" fill="#ffffff"/><path d="M253.15582,185.58782c-2.32084,-1.49735 -3.35244,-4.44875 -2.17722,-6.719c1.17521,-2.27025 4.31793,-2.9997 6.63877,-1.50235c2.32084,1.49734 3.4553,4.55161 2.2801,6.82187c-1.17521,2.27025 -4.4208,2.89684 -6.74164,1.39948z" fill="#ffffff"/></g></g></svg>`;

// 中/英双语词典（key 与下方 t() 对应）
// 语言切换小图标（地球）
const GLOBE_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

const TEXT = {
    zh: {
        title: '登录 / 注册',
        modalTitle: 'TwT个人中心',
        tabLogin: '登录',
        tabRegister: '注册',
        emailLabel: '邮箱',
        emailPlaceholder: '请输入邮箱',
        passwordLabel: '密码',
        passwordPlaceholder: '至少 6 位字符',
        usernameLabel: '用户名',
        usernamePlaceholder: '你的显示昵称',
        sendCode: '发送验证码',
        sending: '发送中',
        register: '注册',
        registering: '注册中',
        loginBtn: '登录',
        loggingIn: '登录中',
        codeLabel: '验证码',
        codePlaceholder: '6 位数字',
        codeSentTo: '验证码已发送至 {email}',
        back: '返回',
        resend: '重新发送（{seconds}秒）',
        success: '成功',
        invalidEmail: '请输入有效的邮箱地址',
        passwordTooShort: '密码至少 6 位',
        invalidUsername: '请输入用户名',
        usernameTaken: '用户名已被占用',
        sendFailed: '发送失败：{reason}',
        registerFailed: '注册失败：{reason}',
        loginFailed: '登录失败：{reason}',
        switchToRegister: '还没有账号？去注册',
        switchToLogin: '已有账号？去登录',
        captchaRequired: '请先完成人机验证后再获取验证码',
        captchaLabel: '人机验证',
        switchLangTitle: '切换语言',
        forgotTitle: '忘记密码',
        forgotDesc: '输入邮箱，我们将发送验证码用于重置密码',
        newPasswordLabel: '新密码',
        newPasswordPlaceholder: '至少 6 位字符',
        confirmPasswordLabel: '确认新密码',
        confirmPasswordPlaceholder: '再次输入新密码',
        forgotPasswordBtn: '忘记密码',
        backToLogin: '返回登录',
        passwordsNotMatch: '两次输入的密码不一致',
        newPasswordTooShort: '新密码至少 6 位',
        passwordResetSuccess: '密码重置成功，请重新登录',
        resetFailed: '重置失败：{reason}',
        invalidCode: '请输入6位验证码',
        or: '或',
        resetBtn: '重置密码',
        resetting: '重置中...',
    },
    en: {
        title: 'Login / Register',
        modalTitle: 'TwT Personal Center',
        tabLogin: 'Login',
        tabRegister: 'Register',
        emailLabel: 'Email',
        emailPlaceholder: 'Enter your email',
        passwordLabel: 'Password',
        passwordPlaceholder: 'At least 6 characters',
        usernameLabel: 'Username',
        usernamePlaceholder: 'Your display name',
        sendCode: 'Send code',
        sending: 'Sending',
        register: 'Register',
        registering: 'Registering',
        loginBtn: 'Login',
        loggingIn: 'Logging in',
        codeLabel: 'Verification code',
        codePlaceholder: '6-digit code',
        codeSentTo: 'A verification code has been sent to {email}',
        back: 'Back',
        resend: 'Resend ({seconds}s)',
        success: 'Success',
        invalidEmail: 'Please enter a valid email',
        passwordTooShort: 'Password must be at least 6 characters',
        invalidUsername: 'Please enter a username',
        usernameTaken: 'Username is already taken',
        sendFailed: 'Send failed: {reason}',
        registerFailed: 'Register failed: {reason}',
        loginFailed: 'Login failed: {reason}',
        switchToRegister: 'No account yet? Switch to Register',
        switchToLogin: 'Have an account? Switch to Login',
        captchaRequired: 'Please complete the human verification first',
        captchaLabel: 'Human verification',
        switchLangTitle: 'Switch Language',
        forgotTitle: 'Forgot Password',
        forgotDesc: 'Enter your email and we will send a verification code to reset your password',
        newPasswordLabel: 'New Password',
        newPasswordPlaceholder: 'At least 6 characters',
        confirmPasswordLabel: 'Confirm New Password',
        confirmPasswordPlaceholder: 'Enter new password again',
        forgotPasswordBtn: 'Forgot Password?',
        backToLogin: 'Back to Login',
        passwordsNotMatch: 'Passwords do not match',
        newPasswordTooShort: 'New password must be at least 6 characters',
        passwordResetSuccess: 'Password reset successful, please log in again',
        resetFailed: 'Reset failed: {reason}',
        invalidCode: 'Please enter a 6-digit verification code',
        or: 'or',
        resetBtn: 'Reset Password',
        resetting: 'Resetting...',
    }
};

const flashClassMap = {
    info: styles.flashInfo,
    success: styles.flashSuccess,
    error: styles.flashError,
    warn: styles.flashWarn
};

// 顶部提示图标（与反馈区报错条一致）
function flashIcon (type) {
    if (type === 'info') {
        return (
            <svg className={styles.flashSvg} viewBox="0 0 52.40221 52.40221" width="18" height="18">
                <g transform="translate(-213.79889,-153.79889)">
                    <g strokeMiterlimit="10">
                        <path d="M216.04889,180c0,-13.22783 10.72328,-23.95111 23.95111,-23.95111c13.22783,0 23.95111,10.72328 23.95111,23.95111c0,13.22783 -10.72328,23.95111 -23.95111,23.95111c-13.22783,0 -23.95111,-10.72328 -23.95111,-23.95111z" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="butt"/>
                        <path d="M240.15553,176.11183v16.79688" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round"/>
                        <path d="M237.45537,167.17145c0,-1.38071 1.11929,-2.5 2.5,-2.5c1.38071,0 2.5,1.11929 2.5,2.5c0,1.38071 -1.11929,2.5 -2.5,2.5c-1.38071,0 -2.5,-1.11929 -2.5,-2.5z" fill="#ffffff" stroke="none" strokeWidth="0.5" strokeLinecap="butt"/>
                    </g>
                </g>
            </svg>
        );
    }
    if (type === 'success') return '✓';
    if (type === 'error') return '✕';
    if (type === 'warn') return '⚠';
    return 'ℹ';
}
function cap (s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

class LoginModalComponent extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            tab: 'login', // 'login' | 'register'
            email: '',
            password: '',
            username: '',
            code: '',
            regStep: 'form', // 'form' | 'code'
            sending: false,
            verifying: false,
            registering: false,
            cooldown: 0,
            flash: '',
            flashType: 'info',
            flashKey: 0,
            flashLeaving: false,
            langOverride: null, // 手动切换语言（null = 跟随编辑器 props.lang）
            turnstileToken: '', // 人机验证（Turnstile）一次性令牌
            forgotStep: 'none' // 'none' | 'email' | 'code'
        };
        this._cooldownTimer = null;
        this._flashTimer = null;
        this._flashLeaveTimer = null;
        this.turnstileRef = React.createRef(); // Turnstile widget 挂载点
        this._turnstileRendered = false;
        this._turnstileWidgetId = null; // 当前已渲染的 widget id（用于语言切换时 remove）
        this._mounted = false;
    }
    componentDidMount () {
        this._mounted = true;
        this.loadTurnstile();
    }
    componentDidUpdate (prevProps, prevState) {
        // 注册标签下，以下任一情况需重建 Turnstile 控件（其 language 仅在初次 render 生效）：
        // - 刚切到注册标签 / 注册步骤在 form↔code 间切换（挂载点变化）
        // - 编辑器语言变化 / 用户手动切换语言（需让控件文案跟随）
        if (this.state.tab === 'register' &&
            (prevState.tab !== 'register' ||
             prevState.regStep !== this.state.regStep ||
             prevProps.lang !== this.props.lang ||
             prevState.langOverride !== this.state.langOverride)) {
            this.removeTurnstile();
            this.loadTurnstile();
        }
        // 忘记密码流程切换到邮箱输入步骤时，也需加载 Turnstile
        if (this.state.forgotStep === 'email' && prevState.forgotStep !== 'email') {
            this.loadTurnstile();
        }
    }

    // 加载 Cloudflare Turnstile 脚本并渲染控件到 this.turnstileRef
    loadTurnstile () {
        if (this._turnstileRendered || !this.turnstileRef.current) return;
        if (window.turnstile) {
            this.renderTurnstile();
            return;
        }
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        s.onload = () => this.renderTurnstile();
        document.body.appendChild(s);
    }

    // 取当前语言（与 t() 一致：手动切换 > 编辑器 props.lang）
    _curLang () {
        return this.state.langOverride ||
            ((this.props.lang === 'en') ? 'en' : 'zh');
    }

    renderTurnstile () {
        if (this._turnstileRendered || !this.turnstileRef.current || !window.turnstile) return;
        this._turnstileRendered = true;
        // language 参数让 Cloudflare 控件文案跟随编辑器语言（仅初次 render 生效，
        // 因此语言切换时需 remove 后重新 render，见 componentDidUpdate）
        this._turnstileWidgetId = window.turnstile.render(this.turnstileRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            // Turnstile 把裸 'zh' 当作繁体（zh-TW）；简体必须显式传 'zh-CN'
            language: this._curLang() === 'zh' ? 'zh-CN' : 'en',
            callback: (token) => { if (this._mounted) this.setState({turnstileToken: token}); },
            'expired-callback': () => { if (this._mounted) this.setState({turnstileToken: ''}); },
            'error-callback': () => { if (this._mounted) this.setState({turnstileToken: ''}); }
        });
    }

    // 销毁已渲染的 widget（语言切换 / 步骤切换时复用同一挂载点前必须先 remove）
    removeTurnstile () {
        if (this._turnstileWidgetId && window.turnstile) {
            try { window.turnstile.remove(this._turnstileWidgetId); } catch (e) { /* 忽略 */ }
        }
        this._turnstileWidgetId = null;
        this._turnstileRendered = false;
    }

    // 提交后重置控件，迫使重新验证（Turnstile token 一次性）
    resetTurnstile () {
        if (this._turnstileRendered && window.turnstile && this.turnstileRef.current) {
            try {
                window.turnstile.reset(this.turnstileRef.current);
            } catch (e) { /* 忽略 */ }
        }
        if (this._mounted) this.setState({turnstileToken: ''});
    }
    componentWillUnmount () {
        this._mounted = false;
        if (this._cooldownTimer) clearInterval(this._cooldownTimer);
        if (this._flashTimer) clearTimeout(this._flashTimer);
        if (this._flashLeaveTimer) clearTimeout(this._flashLeaveTimer);
    }
    // 取当前语言的文案，支持 {key} 变量替换。
    // 语言默认跟随编辑器 props.lang；用户点图标手动切换后由 state.langOverride 覆盖。
    t (key, vars) {
        const lang = this.state.langOverride ||
            ((this.props.lang === 'en') ? 'en' : 'zh');
        let s = (TEXT[lang] && TEXT[lang][key]) || TEXT.en[key] || key;
        if (vars) {
            Object.keys(vars).forEach(k => {
                s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
            });
        }
        return s;
    }
    switchLang () {
        const cur = this.state.langOverride ||
            ((this.props.lang === 'en') ? 'en' : 'zh');
        this.setState({langOverride: cur === 'en' ? 'zh' : 'en'});
    }
    flash (msg, type = 'info') {
        if (!this._mounted) return;
        clearTimeout(this._flashTimer);
        clearTimeout(this._flashLeaveTimer);
        this.setState({flash: msg, flashType: type, flashKey: Date.now(), flashLeaving: false});
        this._flashTimer = setTimeout(() => {
            this.setState({flashLeaving: true});
            this._flashLeaveTimer = setTimeout(() => {
                if (this._mounted) this.setState({flash: '', flashLeaving: false});
            }, 280);
        }, 3000);
    }
    // 按钮内联旋转圈（与反馈提交加载圈一致：白圈 + 文字）
    renderSpinner (text) {
        return (
            <span className={styles.btnLoading}>
                <span className={styles.btnSpinner} />
                {text}
            </span>
        );
    }
    switchTab (tab) {
        this.setState({tab, flash: '', regStep: 'form', forgotStep: 'none'});
    }
    startForgotPassword () {
        this.removeTurnstile(); // 清除注册时的 Turnstile，避免复用导致不显示
        this.setState({forgotStep: 'email', flash: '', code: '', newPassword: '', confirmPassword: ''});
        this.loadTurnstile();
    }
    onForgotEmailChange (e) {
        this.setState({email: e.target.value});
    }
    onForgotCodeChange (e) {
        this.setState({code: e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)});
    }
    onForgotNewPasswordChange (e) {
        this.setState({newPassword: e.target.value});
    }
    onForgotConfirmPasswordChange (e) {
        this.setState({confirmPassword: e.target.value});
    }
    onLoginEmailChange (e) {
        this.setState({email: e.target.value});
    }
    onLoginPasswordChange (e) {
        this.setState({password: e.target.value});
    }
    onRegisterEmailChange (e) {
        this.setState({email: e.target.value});
    }
    onRegisterPasswordChange (e) {
        this.setState({password: e.target.value});
    }
    onRegisterUsernameChange (e) {
        this.setState({username: e.target.value});
    }
    onRegisterCodeChange (e) {
        this.setState({code: e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)});
    }
    onForgotStepNone () {
        this.setState({forgotStep: 'none'});
    }
    onForgotStepEmail () {
        this.setState({forgotStep: 'email'});
    }
    onRegisterStepForm () {
        this.setState({regStep: 'form', code: ''});
    }
    async onForgotPasswordSendCode () {
        const email = this.state.email.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.flash(this.t('invalidEmail'), 'error'); return;
        }
        if (this.state.turnstileToken === '') {
            this.flash(this.t('captchaRequired'), 'info'); return;
        }
        this.setState({sending: true, flash: ''});
        const cfToken = this.state.turnstileToken;
        const res = await sendCode(email, cfToken);
        this.setState({sending: false});
        if (res.ok) {
            this.setState({forgotStep: 'code'});
        } else {
            this.flash(this.t('sendFailed').replace('{reason}', (res.data && res.data.error) || `HTTP ${res.status}`), 'error');
        }
    }
    async onForgotPasswordReset () {
        const email = this.state.email.trim().toLowerCase();
        const code = this.state.code.trim();
        const newPassword = this.state.newPassword;
        const confirmPassword = this.state.confirmPassword;
        if (newPassword.length < PASSWORD_MIN) {
            this.flash(this.t('newPasswordTooShort'), 'error'); return;
        }
        if (newPassword !== confirmPassword) {
            this.flash(this.t('passwordsNotMatch'), 'error'); return;
        }
        if (!/^\d{6}$/.test(code)) {
            this.flash(this.t('invalidCode'), 'error'); return;
        }
        this.setState({verifying: true, flash: ''});
        const res = await resetPassword(email, code, newPassword);
        this.setState({verifying: false});
        if (res.ok) {
            this.setState({forgotStep: 'none', flash: this.t('passwordResetSuccess'), flashType: 'success'});
        } else {
            this.flash(this.t('resetFailed').replace('{reason}', (res.data && res.data.error) || `HTTP ${res.status}`), 'error');
        }
    }
    startCooldown () {
        this.setState({cooldown: COOLDOWN_SECONDS});
        if (this._cooldownTimer) clearInterval(this._cooldownTimer);
        this._cooldownTimer = setInterval(() => {
            if (!this._mounted) {
                clearInterval(this._cooldownTimer);
                return;
            }
            this.setState(prev => {
                if (prev.cooldown <= 1) {
                    clearInterval(this._cooldownTimer);
                    return {cooldown: 0};
                }
                return {cooldown: prev.cooldown - 1};
            });
        }, 1000);
    }
    async onSendCode () {
        const email = this.state.email.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.flash(this.t('invalidEmail'), 'info');
            return;
        }
        if (this.state.password.length < PASSWORD_MIN) {
            this.flash(this.t('passwordTooShort'), 'error');
            return;
        }
        if (!this.state.username.trim()) {
            this.flash(this.t('invalidUsername'), 'error');
            return;
        }
        if (!this.state.turnstileToken) {
            this.flash(this.t('captchaRequired'), 'info');
            return;
        }
        const cfToken = this.state.turnstileToken;
        this.setState({sending: true});
        try {
            const res = await sendCode(email, cfToken);
            if (res.ok && res.data && res.data.ok) {
                this.flash(this.t('sendCode'), 'success');
                this.setState({regStep: 'code'});
                this.startCooldown();
            } else {
                const reason = (res.data && res.data.error) || `HTTP ${res.status}`;
                this.flash(this.t('sendFailed', {reason}), 'error');
            }
        } catch (e) {
            this.flash(this.t('sendFailed', {reason: String(e)}), 'error');
        } finally {
            if (this._mounted) this.setState({sending: false});
            this.resetTurnstile();
        }
    }
    async onRegister () {
        const {email, code, password, username} = this.state;
        if (code.length !== CODE_LENGTH) return;
        if (password.length < PASSWORD_MIN) {
            this.flash(this.t('passwordTooShort'), 'error');
            return;
        }
        this.setState({registering: true});
        try {
            const res = await register(
                email.trim().toLowerCase(),
                code.trim(),
                password,
                username.trim()
            );
            if (res.ok && res.data && res.data.ok) {
                this.flash(this.t('success'), 'success');
                if (this.props.onLogin) this.props.onLogin(getSession());
                setTimeout(() => {
                    if (this._mounted && this.props.onClose) this.props.onClose();
                }, 400);
            } else {
                const errCode = (res.data && res.data.error) || '';
                if (errCode === 'username_taken') {
                    this.flash(this.t('usernameTaken'), 'error');
                } else {
                    const reason = errCode || `HTTP ${res.status}`;
                    this.flash(this.t('registerFailed', {reason}), 'error');
                }
            }
        } catch (e) {
            this.flash(this.t('registerFailed', {reason: String(e)}), 'error');
        } finally {
            if (this._mounted) this.setState({registering: false});
        }
    }
    async onLogin () {
        const {email, password} = this.state;
        if (!email || !password) return;
        this.setState({verifying: true});
        try {
            const res = await login(email.trim().toLowerCase(), password);
            if (res.ok && res.data && res.data.ok) {
                this.flash(this.t('success'), 'success');
                if (this.props.onLogin) this.props.onLogin(getSession());
                setTimeout(() => {
                    if (this._mounted && this.props.onClose) this.props.onClose();
                }, 400);
            } else {
                const reason = (res.data && res.data.error) || `HTTP ${res.status}`;
                this.flash(this.t('loginFailed', {reason}), 'error');
            }
        } catch (e) {
            this.flash(this.t('loginFailed', {reason: String(e)}), 'error');
        } finally {
            if (this._mounted) this.setState({verifying: false});
        }
    }
    // 顶部提示条：作为 Modal 的直接子节点（.body 滚动容器的兄弟节点），
    // 这样无论 .body 内部如何滚动，提示条都恒紧贴弹窗顶栏，不会随内容滚动而错位。
    renderFlash () {
        const {flash, flashType, flashKey, flashLeaving} = this.state;
        if (!flash) return null;
        const flashClass = flashClassMap[flashType] || styles.flashInfo;
        return (
            <div
                key={flashKey}
                className={`${styles.flash} ${flashClass} ${flashLeaving ? styles.flashLeaving : ''}`}
            >
                <span className={styles.flashIcon}>{flashIcon(flashType)}</span>
                <span className={styles.flashText}>{flash}</span>
            </div>
        );
    }
    renderBody () {
        const {tab, email, password, username, code, regStep, sending, verifying,
            registering, cooldown, forgotStep} = this.state;
        const T = key => this.t(key);
        return (
            <div className={styles.body}>
                <div className={styles.titleRow}>
                    <span
                        className={styles.titleLogo}
                        dangerouslySetInnerHTML={{__html: LOGO_SVG}}
                    />
                    <h2 className={styles.title}>{forgotStep !== 'none' ? T('forgotTitle') : T('title')}</h2>
                </div>

                {forgotStep !== 'none' ? (
                    <div className={styles.form}>
                        {forgotStep === 'email' ? (
                            <>
                                <p className={styles.hint}>{T('forgotDesc')}</p>
                                <label className={styles.label}>
                                    {T('emailLabel')}
                                </label>
                                <input
                                    type="email"
                                    className={styles.input}
                                    placeholder={T('emailPlaceholder')}
                                    value={email}
                                    onChange={e => this.onForgotEmailChange(e)}
                                />
                                <label className={styles.label}>{T('captchaLabel')}</label>
                                <div className={styles.turnstileBox}>
                                    <div ref={this.turnstileRef} />
                                </div>
                                <button
                                    type="button"
                                    className={styles.submitBtn}
                                    disabled={sending}
                                    onClick={() => this.onForgotPasswordSendCode()}
                                >
                                    {sending ? this.renderSpinner(T('sending')) : T('sendCode')}
                                </button>
                                <div className={styles.switchHint} onClick={() => this.onForgotStepNone()}>
                                    {T('backToLogin')}
                                </div>
                            </>
                        ) : (
                            <>
                                <p className={styles.hint}>{T('codeSentTo').replace('{email}', email)}</p>
                                <label className={styles.label}>
                                    {T('codeLabel')}
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={CODE_LENGTH}
                                    className={styles.input}
                                    placeholder={T('codePlaceholder')}
                                    value={code}
                                    onChange={e => this.onForgotCodeChange(e)}
                                />
                                <label className={styles.label}>
                                    {T('newPasswordLabel')}
                                </label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    placeholder={T('newPasswordPlaceholder')}
                                    value={this.state.newPassword}
                                    onChange={e => this.onForgotNewPasswordChange(e)}
                                />
                                <label className={styles.label}>
                                    {T('confirmPasswordLabel')}
                                </label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    placeholder={T('confirmPasswordPlaceholder')}
                                    value={this.state.confirmPassword}
                                    onChange={e => this.onForgotConfirmPasswordChange(e)}
                                />
                                <button
                                    type="button"
                                    className={styles.submitBtn}
                                    disabled={verifying || code.length !== CODE_LENGTH || this.state.newPassword.length < PASSWORD_MIN || this.state.newPassword !== this.state.confirmPassword}
                                    onClick={() => this.onForgotPasswordReset()}
                                >
                                    {verifying ? this.renderSpinner(T('resetting')) : T('resetBtn')}
                                </button>
                                <div className={styles.switchHint} onClick={() => this.onForgotStepEmail()}>
                                    {T('back')}
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                    <div className={styles.tabs}>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${tab === 'login' ? styles.tabActive : ''}`}
                        onClick={this.switchTab.bind(this, 'login')}
                    >
                        {T('tabLogin')}
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${tab === 'register' ? styles.tabActive : ''}`}
                        onClick={this.switchTab.bind(this, 'register')}
                    >
                        {T('tabRegister')}
                    </button>
                </div>

                {tab === 'login' ? (
                    <div className={styles.form}>
                        <label className={styles.label}>
                            {T('emailLabel')}
                        </label>
                        <input
                            type="email"
                            className={styles.input}
                            placeholder={T('emailPlaceholder')}
                            value={email}
                            onChange={e => this.onLoginEmailChange(e)}
                            onKeyDown={e => e.key === 'Enter' && this.onLogin()}
                        />
                        <label className={styles.label}>
                            {T('passwordLabel')}
                        </label>
                        <input
                            type="password"
                            className={styles.input}
                            placeholder={T('passwordPlaceholder')}
                            value={password}
                            onChange={e => this.onLoginPasswordChange(e)}
                            onKeyDown={e => e.key === 'Enter' && this.onLogin()}
                        />
                        <button
                            type="button"
                            className={styles.submitBtn}
                            disabled={verifying || !email.trim() || !password}
                            onClick={() => this.onLogin()}
                        >
                            {verifying ? this.renderSpinner(T('loggingIn')) : T('loginBtn')}
                        </button>
                        <div className={styles.bottomLinks}>
                            <div className={styles.switchHint} onClick={this.switchTab.bind(this, 'register')}>
                                {T('switchToRegister')}
                            </div>
                            <span className={styles.separator}>{T('or')}</span>
                            <div className={styles.forgotLink} onClick={() => this.startForgotPassword()}>
                                {T('forgotPasswordBtn')}
                            </div>
                        </div>
                    </div>
                ) : (
                    regStep === 'form' ? (
                        <div className={styles.form}>
                            <label className={styles.label}>
                                {T('emailLabel')}
                            </label>
                            <input
                                type="email"
                                className={styles.input}
                                placeholder={T('emailPlaceholder')}
                                value={email}
                                onChange={e => this.onRegisterEmailChange(e)}
                            />
                            <label className={styles.label}>
                                {T('passwordLabel')}
                            </label>
                            <input
                                type="password"
                                className={styles.input}
                                placeholder={T('passwordPlaceholder')}
                                value={password}
                                onChange={e => this.onRegisterPasswordChange(e)}
                            />
                            <label className={styles.label}>
                                {T('usernameLabel')}
                            </label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder={T('usernamePlaceholder')}
                                value={username}
                                onChange={e => this.onRegisterUsernameChange(e)}
                                onKeyDown={e => e.key === 'Enter' && this.onSendCode()}
                            />
                            <label className={styles.label}>{T('captchaLabel')}</label>
                            <div className={styles.turnstileBox}>
                                <div ref={this.turnstileRef} />
                            </div>
                            <button
                                type="button"
                                className={styles.submitBtn}
                                disabled={sending || !email.trim() || password.length < PASSWORD_MIN || !username.trim()}
                                onClick={() => this.onSendCode()}
                            >
                                {sending ? this.renderSpinner(T('sending')) : T('sendCode')}
                            </button>
                            <div className={styles.switchHint} onClick={this.switchTab.bind(this, 'login')}>
                                {T('switchToLogin')}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.form}>
                            <p className={styles.hint}>
                                {T('codeSentTo').replace('{email}', email)}
                            </p>
                            <label className={styles.label}>
                                {T('codeLabel')}
                            </label>
                            <div className={styles.codeWrap}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={CODE_LENGTH}
                                    className={styles.input}
                                    placeholder={T('codePlaceholder')}
                                    value={code}
                                    onChange={e => this.onRegisterCodeChange(e)}
                                    onKeyDown={e => e.key === 'Enter' && this.onRegister()}
                                />
                                <button
                                    type="button"
                                    className={styles.langIconBtn}
                                    title={T('switchLangTitle')}
                                    aria-label="switch language"
                                    onClick={() => this.switchLang()}
                                    dangerouslySetInnerHTML={{__html: GLOBE_SVG}}
                                />
                            </div>
                            <button
                                type="button"
                                className={styles.submitBtn}
                                disabled={registering || code.length !== CODE_LENGTH}
                                onClick={() => this.onRegister()}
                            >
                                {registering ? this.renderSpinner(T('registering')) : T('register')}
                            </button>
                            <div className={styles.footer}>
                                <button
                                    type="button"
                                    className={styles.linkBtn}
                                    disabled={cooldown > 0 || sending}
                                    onClick={() => this.onSendCode()}
                                >
                                    {cooldown > 0
                                        ? T('resend').replace('{seconds}', cooldown)
                                        : T('sendCode')}
                                </button>
                                <button
                                    type="button"
                                    className={styles.linkBtn}
                                    onClick={() => this.onRegisterStepForm()}
                                >
                                    {T('back')}
                                </button>
                            </div>
                        </div>
                    )
                )}
                    </>
                )}
            </div>
        );
    }
    render () {
        if (this.props.embedded) {
            // 嵌入模式（如反馈弹窗内）：同样把提示条置于 .body 之外，紧贴容器顶。
            return (
                <React.Fragment>
                    {this.renderFlash()}
                    {this.renderBody()}
                </React.Fragment>
            );
        }
        return (
            <Modal
                className={styles.modalContent}
                onRequestClose={this.props.onClose}
                contentLabel={this.t('modalTitle')}
                id="loginModal"
            >
                {this.renderFlash()}
                {this.renderBody()}
            </Modal>
        );
    }
}

LoginModalComponent.propTypes = {
    onClose: PropTypes.func,
    onLogin: PropTypes.func,
    embedded: PropTypes.bool,
    lang: PropTypes.string
};

export default LoginModalComponent;
