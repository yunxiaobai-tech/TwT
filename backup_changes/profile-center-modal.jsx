import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import styles from './profile-center-modal.css';
import Input from '../forms/input.jsx';
import Button from '../button/button.jsx';
import {createFeedbackStore, getDeviceId, NAME_COOLDOWN_DAYS} from '../../lib/tw-feedback-store.js';
import {getAvatar, setAvatar, logout} from '../../lib/tw-auth-store.js';

const messages = defineMessages({
    title: {
        id: 'tw.profile.title',
        defaultMessage: 'Profile',
        description: '个人中心弹窗标题'
    },
    change: {
        id: 'tw.profile.change',
        defaultMessage: 'Edit',
        description: '修改用户名按钮文字'
    },
    changeBtnCooldown: {
        id: 'tw.profile.changeBtnCooldown',
        defaultMessage: 'Edit ({left} days left)',
        description: '修改用户名按钮文字（冷却中）'
    },
    changeTitleCooldown: {
        id: 'tw.profile.changeTitleCooldown',
        defaultMessage: 'Change nickname (once per {days} days, {left} left)',
        description: '修改昵称提示标题（冷却中）'
    },
    changeTitle: {
        id: 'tw.profile.changeTitle',
        defaultMessage: 'Change nickname (once per {days} days)',
        description: '修改昵称提示标题'
    },
    namePlaceholder: {
        id: 'tw.profile.namePlaceholder',
        defaultMessage: 'Enter new nickname (2-20 characters)',
        description: '昵称输入框占位符'
    },
    save: {
        id: 'tw.profile.save',
        defaultMessage: 'Save',
        description: '保存按钮'
    },
    cancel: {
        id: 'tw.profile.cancel',
        defaultMessage: 'Cancel',
        description: '取消按钮'
    },
    avatarUploadHint: {
        id: 'tw.profile.avatarUploadHint',
        defaultMessage: 'Upload avatar',
        description: '头像上传悬停提示'
    },
    avatarUpdated: {
        id: 'tw.profile.avatarUpdated',
        defaultMessage: 'Avatar updated',
        description: '头像更新成功提示（已同步到账户）'
    },
    avatarUpdatedLocal: {
        id: 'tw.profile.avatarUpdatedLocal',
        defaultMessage: 'Avatar saved locally (sign in to sync across devices)',
        description: '头像仅存本机提示'
    },
    avatarTooLarge: {
        id: 'tw.profile.avatarTooLarge',
        defaultMessage: 'Avatar too large (try under 2 MB)',
        description: '头像图片过大提示'
    },
    avatarReadFailed: {
        id: 'tw.profile.avatarReadFailed',
        defaultMessage: 'Failed to read avatar, please try another image',
        description: '头像读取失败提示'
    },
    logout: {
        id: 'tw.profile.logout',
        defaultMessage: 'Log out',
        description: '解除登录按钮'
    },
    logoutHint: {
        id: 'tw.profile.logoutHint',
        defaultMessage: 'Log out this device from your account',
        description: '解除登录按钮说明'
    },
    loggedOut: {
        id: 'tw.profile.loggedOut',
        defaultMessage: 'Logged out on this device',
        description: '解除登录成功提示'
    },
    registeredAt: {
        id: 'tw.profile.registeredAt',
        defaultMessage: 'Registered',
        description: '注册账户时间标签'
    },
    fNameMin: {
        id: 'tw.feedback.fNameMin',
        defaultMessage: '昵称至少 2 个字',
        description: '昵称过短'
    },
    fNameMax: {
        id: 'tw.feedback.fNameMax',
        defaultMessage: '昵称最多 20 个字',
        description: '昵称过长'
    },
    fNameSaved: {
        id: 'tw.feedback.fNameSaved',
        defaultMessage: '昵称已保存',
        description: '昵称保存成功'
    },
    fNameTaken: {
        id: 'tw.feedback.fNameTaken',
        defaultMessage: '昵称「{name}」已被占用，换一个吧',
        description: '昵称被占用'
    },
    fNameCooldown: {
        id: 'tw.feedback.fNameCooldown',
        defaultMessage: '{days} 天内只能改一次，还需 {left} 天',
        description: '昵称冷却中'
    },
    fNameSaveFailed: {
        id: 'tw.feedback.fNameSaveFailed',
        defaultMessage: '保存失败：{msg}',
        description: '昵称保存失败'
    },
    fNameLocal: {
        id: 'tw.feedback.fNameLocal',
        defaultMessage: '本地模式：昵称仅保存在本设备',
        description: '本地模式保存昵称'
    },
    fNoUsernamesTable: {
        id: 'tw.feedback.fNoUsernamesTable',
        defaultMessage: '昵称服务暂不可用',
        description: '昵称数据表缺失'
    }
});

const NAME_KEY = 'twt_feedback_name';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

// 与反馈区完全一致的默认头像（暗/亮两套）
function PersonAvatar ({isDark}) {
    if (isDark) {
        return (
            <svg
                className={styles.personAvatar}
                viewBox="0 0 163.94324 167.9203"
                width="100%"
                height="100%"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient
                        x1="240"
                        y1="172.64318"
                        x2="240"
                        y2="240.39498"
                        gradientUnits="userSpaceOnUse"
                        id="twt-profile-person-grad"
                    >
                        <stop offset="0" stopColor="#666666" />
                        <stop offset="1" stopColor="#b5b5b5" />
                    </linearGradient>
                </defs>
                <g transform="translate(-158.02838,-96.03985)">
                    <g stroke="none" strokeMiterlimit="10">
                        <path
                            d="M158.02838,180c0,-46.36991 36.69995,-83.96015 81.97162,-83.96015c45.27168,0 81.97162,37.59024 81.97162,83.96015c0,46.36991 -36.69995,83.96015 -81.97162,83.96015c-45.27167,0 -81.97162,-37.59024 -81.97162,-83.96015z"
                            fill="#ffffff"
                            strokeWidth="0"
                        />
                        <path
                            d="M192.09224,220.55094c0,-26.45872 21.44903,-47.90776 47.90776,-47.90776c26.45873,0 47.90776,21.44904 47.90776,47.90776c0,26.45872 -95.81552,26.45872 -95.81552,0z"
                            fill="url(#twt-profile-person-grad)"
                            strokeWidth="NaN"
                        />
                        <path
                            d="M262.73474,144.57212c0,13.78895 -11.17815,24.9671 -24.9671,24.9671c-13.78895,0 -24.96709,-11.17815 -24.96709,-24.96709c0,-13.78895 11.17815,-24.9671 24.9671,-24.9671c13.78895,0 24.9671,11.17815 24.9671,24.9671z"
                            fill="#666666"
                            strokeWidth="0"
                        />
                    </g>
                </g>
            </svg>
        );
    }
    return (
        <svg
            className={styles.personAvatar}
            viewBox="0 0 163.94324 167.9203"
            width="100%"
            height="100%"
            aria-hidden="true"
        >
            <defs>
                <linearGradient
                    x1="240"
                    y1="172.64318"
                    x2="240"
                    y2="240.39498"
                    gradientUnits="userSpaceOnUse"
                    id="twt-profile-person-grad-light"
                >
                    <stop offset="0" stopColor="#898989" />
                    <stop offset="1" stopColor="#ffffff" />
                </linearGradient>
            </defs>
            <g transform="translate(-158.02838,-96.03985)">
                <g stroke="none" strokeMiterlimit="10">
                    <path
                        d="M158.02838,180c0,-46.36991 36.69995,-83.96015 81.97162,-83.96015c45.27168,0 81.97162,37.59024 81.97162,83.96015c0,46.36991 -36.69995,83.96015 -81.97162,83.96015c-45.27167,0 -81.97162,-37.59024 -81.97162,-83.96015z"
                        fill="#4d4d4d"
                        strokeWidth="0"
                    />
                    <path
                        d="M192.09224,220.55094c0,-26.45872 21.44903,-47.90776 47.90776,-47.90776c26.45873,0 47.90776,21.44904 47.90776,47.90776c0,26.45872 -95.81552,26.45872 -95.81552,0z"
                        fill="url(#twt-profile-person-grad-light)"
                        strokeWidth="NaN"
                    />
                    <path
                        d="M262.73474,144.57212c0,13.78895 -11.17815,24.9671 -24.9671,24.9671c-13.78895,0 -24.96709,-11.17815 -24.96709,-24.96709c0,-13.78895 11.17815,-24.9671 24.9671,-24.9671c13.78895,0 24.9671,11.17815 24.9671,24.9671z"
                        fill="#d4d4d4"
                        strokeWidth="0"
                    />
                </g>
            </g>
        </svg>
    );
}

// 与反馈区完全一致的 flash 图标
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

function inferFlashType (msg) {
    if (/失败|占用|未建|错误/i.test(msg)) return 'error';
    if (/已保存|已提交|感谢|成功|已更新/i.test(msg)) return 'success';
    if (/上限|最多|至少|请先|还需|本地模式|冷却|建议|无法|过大/i.test(msg)) return 'warn';
    return 'info';
}

function cap (s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// 修改 SVG 图标（铅笔）
function EditSvg () {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </g>
        </svg>
    );
}

// 上传图标（相机/箭头向上）
function UploadSvg () {
    return (
        <svg className={styles.avatarUploadIcon} viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M17 8l-5-5-5 5" />
                <path d="M12 3v12" />
            </g>
        </svg>
    );
}

class ProfileCenterModal extends React.Component {
    constructor (props) {
        super(props);
        this.deviceId = getDeviceId();
        let name = '';
        try {
            name = localStorage.getItem(NAME_KEY) || '';
        } catch (e) { /* 忽略 */ }
        this.state = {
            avatar: '',
            nameRecord: name ? {name, name_updated_at: null} : null,
            nameDraft: name,
            editingName: false,
            savingName: false,
            registeredAt: null,
            flash: '',
            flashType: 'info',
            flashKey: 0,
            flashLeaving: false
        };
        this.store = null;
        this.fileInput = React.createRef();
        this._mounted = true;
        this.loadUsername = this.loadUsername.bind(this);
        this.loadAvatar = this.loadAvatar.bind(this);
        this.cooldownDaysLeft = this.cooldownDaysLeft.bind(this);
        this.avatarIsDark = this.avatarIsDark.bind(this);
        this.startEditName = this.startEditName.bind(this);
        this.cancelEditName = this.cancelEditName.bind(this);
        this.onSaveName = this.onSaveName.bind(this);
        this.flash = this.flash.bind(this);
        this.onAvatarClick = this.onAvatarClick.bind(this);
        this.onAvatarChange = this.onAvatarChange.bind(this);
        this.onLogout = this.onLogout.bind(this);
    }

    componentDidMount () {
        this.store = createFeedbackStore();
        this.loadUsername();
        this.loadAvatar();
    }

    loadAvatar () {
        getAvatar()
            .then(res => {
                if (!this._mounted) return;
                if (res && res.url) this.setState({avatar: res.url});
                if (res && res.createdAt) this.setState({registeredAt: res.createdAt});
            })
            .catch(() => { /* 忽略 */ });
    }

    componentWillUnmount () {
        this._mounted = false;
        clearTimeout(this.flashTimer);
        clearTimeout(this.flashLeaveTimer);
    }

    onLogout () {
        logout()
            .then(() => {
                // 广播登录态变化，让反馈区等同页组件重新检查登录（需要重新登录）
                try {
                    window.dispatchEvent(new StorageEvent('storage', {key: 'twt_email_token'}));
                } catch (e) { /* 忽略 */ }
                if (typeof this.props.onClose === 'function') this.props.onClose();
                this.flash(this.props.intl.formatMessage(messages.loggedOut), 'success');
            });
    }

    loadUsername () {
        if (!this.store || !this.store.getUsername) return;
        this.store.getUsername(this.deviceId)
            .then(rec => {
                if (rec && rec.name) {
                    if (this._mounted) {
                        this.setState({
                            nameRecord: {name: rec.name, name_updated_at: rec.name_updated_at},
                            editingName: false,
                            nameDraft: rec.name
                        });
                    }
                    try {
                        localStorage.setItem(NAME_KEY, rec.name);
                    } catch (e) { /* 忽略 */ }
                }
            })
            .catch(() => { /* 读取失败静默，使用本地缓存 */ });
    }

    cooldownDaysLeft () {
        const rec = this.state.nameRecord;
        if (!rec || !rec.name_updated_at) return 0;
        const updated = new Date(rec.name_updated_at).getTime();
        if (!updated) return 0;
        const cd = NAME_COOLDOWN_DAYS * 86400000;
        const elapsed = Date.now() - updated;
        return elapsed >= cd ? 0 : Math.ceil((cd - elapsed) / 86400000);
    }

    avatarIsDark () {
        const theme = this.props.theme;
        if (theme && typeof theme.isDark === 'function') return theme.isDark();
        if (typeof document !== 'undefined') {
            const de = document.documentElement;
            const isDarkAttr = de.getAttribute('data-theme') === 'dark' || de.getAttribute('theme') === 'dark';
            const isDarkClass = document.body && document.body.classList.contains('dark');
            if (isDarkAttr || isDarkClass) return true;
        }
        return false;
    }

    // 与反馈区完全一致的 flash 逻辑/动画
    flash (msg, type) {
        const flashType = type || inferFlashType(msg);
        clearTimeout(this.flashTimer);
        clearTimeout(this.flashLeaveTimer);
        this.setState({flash: msg, flashType: flashType, flashKey: Date.now(), flashLeaving: false});
        this.flashTimer = setTimeout(() => {
            this.setState({flashLeaving: true});
            this.flashLeaveTimer = setTimeout(() => {
                this.setState({flash: '', flashLeaving: false});
            }, 280);
        }, 2200);
    }

    onAvatarClick () {
        if (this.fileInput.current) this.fileInput.current.click();
    }

    onAvatarChange (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > AVATAR_MAX_BYTES) {
            this.flash(this.props.intl.formatMessage(messages.avatarTooLarge), 'warn');
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            // 先本地预览，再异步同步到账户（跨设备）
            this.setState({avatar: dataUrl});
            setAvatar(dataUrl)
                .then(res => {
                    if (res.ok) {
                        this.flash(
                            res.source === 'server'
                                ? this.props.intl.formatMessage(messages.avatarUpdated)
                                : this.props.intl.formatMessage(messages.avatarUpdatedLocal),
                            'success'
                        );
                    } else {
                        this.flash(this.props.intl.formatMessage(messages.avatarReadFailed), 'error');
                    }
                })
                .catch(() => {
                    this.flash(this.props.intl.formatMessage(messages.avatarReadFailed), 'error');
                });
        };
        reader.onerror = () => {
            this.flash(this.props.intl.formatMessage(messages.avatarReadFailed), 'error');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    startEditName () {
        const left = this.cooldownDaysLeft();
        if (left > 0) {
            this.flash(this.props.intl.formatMessage(messages.fNameCooldown, {days: NAME_COOLDOWN_DAYS, left}), 'warn');
            return;
        }
        this.setState({editingName: true, nameDraft: this.myName});
    }

    cancelEditName () {
        this.setState({editingName: false, nameDraft: this.myName});
    }

    onSaveName () {
        const name = (this.state.nameDraft || '').trim();
        if (name.length < 2) {
            this.flash(this.props.intl.formatMessage(messages.fNameMin), 'warn');
            return;
        }
        if (name.length > 20) {
            this.flash(this.props.intl.formatMessage(messages.fNameMax), 'warn');
            return;
        }
        this.setState({savingName: true});
        if (!this.store || !this.store.setUsername) {
            // 本地模式兜底
            try {
                localStorage.setItem(NAME_KEY, name);
            } catch (e) { /* 忽略 */ }
            this.setState({
                nameRecord: {name, name_updated_at: null},
                editingName: false,
                savingName: false
            });
            this.flash(this.props.intl.formatMessage(messages.fNameLocal), 'info');
            return;
        }
        this.store.setUsername(this.deviceId, name)
            .then(rec => {
                if (!this._mounted) return;
                this.setState({
                    nameRecord: {name: rec.name, name_updated_at: rec.name_updated_at},
                    editingName: false,
                    savingName: false
                });
                try {
                    localStorage.setItem(NAME_KEY, rec.name);
                } catch (e) { /* 忽略 */ }
                this.flash(this.props.intl.formatMessage(messages.fNameSaved), 'success');
            })
            .catch(err => {
                if (!this._mounted) return;
                this.setState({savingName: false});
                const body = err && err.body;
                const msg = (err && err.message) ? err.message : String(err);
                if (body && body.code === '23505') {
                    this.flash(this.props.intl.formatMessage(messages.fNameTaken, {name}), 'info');
                    return;
                }
                if (body && body.code === '42P01') {
                    this.flash(this.props.intl.formatMessage(messages.fNoUsernamesTable), 'error');
                    return;
                }
                if ((err && err.cooldownDays) || msg.indexOf('cooldown') !== -1) {
                    const m = msg.match(/(\d+)/);
                    const days = err.cooldownDays || (m ? m[1] : NAME_COOLDOWN_DAYS);
                    this.flash(this.props.intl.formatMessage(messages.fNameCooldown, {days: NAME_COOLDOWN_DAYS, left: days}), 'warn');
                    return;
                }
                this.flash(this.props.intl.formatMessage(messages.fNameSaveFailed, {msg}), 'error');
            });
    }

    get myName () {
        return (this.state.nameRecord && this.state.nameRecord.name) || '';
    }

    formatRegisteredAt (iso, locale) {
        const d = new Date(iso);
        if (!d || isNaN(d.getTime())) return iso;
        const isZh = locale && locale.indexOf('zh') === 0;
        try {
            return new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: isZh ? 'long' : 'short',
                day: 'numeric'
            }).format(d);
        } catch (e) {
            return d.toLocaleDateString();
        }
    }

    render () {
        const {intl} = this.props;
        const {flash, flashType, flashKey, flashLeaving, avatar, editingName, nameDraft, savingName, registeredAt} = this.state;
        const cooldownLeft = this.cooldownDaysLeft();
        const currentName = this.myName;

        let changeBtnLabel;
        if (cooldownLeft > 0) {
            changeBtnLabel = intl.formatMessage(messages.changeBtnCooldown, {left: cooldownLeft});
        } else {
            changeBtnLabel = intl.formatMessage(messages.change);
        }

        return (
            <div className={styles.profileCenter}>
                {flash ? (
                    <div
                        key={flashKey}
                        className={`${styles.flash} ${styles['flash' + cap(flashType)]} ${flashLeaving ? styles.flashLeaving : ''}`}
                    >
                        <span className={styles.flashIcon}>{flashIcon(flashType)}</span>
                        <span className={styles.flashText}>{flash}</span>
                    </div>
                ) : null}

                <div className={styles.userCard}>
                    <div
                        className={styles.avatarWrap}
                        onClick={this.onAvatarClick}
                        role="button"
                        tabIndex={0}
                        title={intl.formatMessage(messages.avatarUploadHint)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') this.onAvatarClick();
                        }}
                    >
                        {avatar ? (
                            <img
                                className={styles.avatarImg}
                                src={avatar}
                                alt="avatar"
                            />
                        ) : (
                            <div className={styles.avatarImg}>
                                <PersonAvatar isDark={this.avatarIsDark()} />
                            </div>
                        )}
                        <div className={styles.avatarOverlay}>
                            <UploadSvg />
                        </div>
                        <input
                            ref={this.fileInput}
                            type="file"
                            accept="image/*"
                            className={styles.avatarInput}
                            onChange={this.onAvatarChange}
                        />
                    </div>

                    <div className={styles.userInfo}>
                        {editingName ? (
                            <div className={styles.nameEditRow}>
                                <Input
                                    className={styles.nameInput}
                                    placeholder={intl.formatMessage(messages.namePlaceholder)}
                                    value={nameDraft}
                                    maxLength={20}
                                    autoFocus
                                    onChange={e => this.setState({nameDraft: e.target.value})}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') this.onSaveName();
                                        if (e.key === 'Escape') this.cancelEditName();
                                    }}
                                />
                                <button
                                    className={styles.saveBtn}
                                    disabled={savingName}
                                    onClick={this.onSaveName}
                                >
                                    {intl.formatMessage(messages.save)}
                                </button>
                                <button
                                    className={styles.cancelBtn}
                                    onClick={this.cancelEditName}
                                >
                                    {intl.formatMessage(messages.cancel)}
                                </button>
                            </div>
                        ) : (
                            <React.Fragment>
                                <div className={styles.username}>{currentName || '—'}</div>
                                <button
                                    className={styles.changeNameBtn}
                                    onClick={this.startEditName}
                                    title={cooldownLeft > 0
                                        ? intl.formatMessage(messages.changeTitleCooldown, {days: NAME_COOLDOWN_DAYS, left: cooldownLeft})
                                        : intl.formatMessage(messages.changeTitle, {days: NAME_COOLDOWN_DAYS})}
                                >
                                    <EditSvg />
                                    <span>{changeBtnLabel}</span>
                                </button>
                                {registeredAt ? (
                                    <div className={styles.registeredAt}>
                                        {intl.formatMessage(messages.registeredAt)}：{this.formatRegisteredAt(registeredAt, intl.locale)}
                                    </div>
                                ) : null}
                            </React.Fragment>
                        )}
                    </div>
                </div>

                <div className={styles.logoutRow}>
                    <Button
                        className={styles.logoutBtn}
                        onClick={this.onLogout}
                        title={intl.formatMessage(messages.logoutHint)}
                    >
                        {intl.formatMessage(messages.logout)}
                    </Button>
                </div>
            </div>
        );
    }
}

ProfileCenterModal.propTypes = {
    intl: intlShape,
    theme: PropTypes.shape({
        isDark: PropTypes.func
    })
};

export default injectIntl(ProfileCenterModal);
