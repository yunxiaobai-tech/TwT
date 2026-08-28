import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {
    createFeedbackStore,
    countToday,
    DAILY_LIMIT_COUNT,
    NAME_COOLDOWN_DAYS,
    getDeviceId
} from '../../lib/tw-feedback-store.js';
import styles from './feedback-modal.css';
import { moderateComment } from '../../lib/tw-feedback-ai.js';
import LoginModal from '../tw-login-modal/login-modal.jsx';
import { isLoggedIn, getSession, getMyRole, adminCall, getAvatar } from '../../lib/tw-auth-store.js';

const NAME_KEY = 'twt_feedback_name';
const LIKED_KEY = 'twt_feedback_liked_v1';
const AGREED_KEY = 'twt_feedback_agreed'; // 是否已确认《反馈发布公约》
const MAX_IMAGES = 4;
const SUBMIT_COOLDOWN_MS = 25000; // 提交反馈后 25 秒内禁止再次发布
const COMMENT_REMOVE_MS = 360;    // 评论退场动画时长(ms)，需与 CSS .commentRemoving 动画时长一致
const REPLY_ANIM_MS = 220;       // 回复输入框入场/出场动画时长(ms)，需与 CSS .replyEnter/.replyLeave 动画时长一致
const RATE_LIMIT_WINDOW_MS = 120000; // 频繁操作判定窗口：2 分钟内发帖达阈值则禁发
const RATE_LIMIT_MAX = 3;           // 发帖次数上限（含本次），达到即禁发
const RATE_LIMIT_BLOCK_MS = 60000;  // 触发后禁发时长（1 分钟）
const RATE_TS_KEY = 'twt_submit_times_v1'; // 每次发帖的时间戳记录（按设备持久化）

const messages = defineMessages({
    areaLabel: {
        id: 'tw.feedback.areaLabel',
        defaultMessage: 'TwT Feedback'
    },
    conventionTitle: {
        id: 'tw.feedback.conventionTitle',
        defaultMessage: 'TwT Community Feedback Guidelines'
    },
    convention1: {
        id: 'tw.feedback.convention1',
        defaultMessage: 'Maintain civility. Personal attacks, insults, and flame wars are prohibited. Criticism is welcome, but must reference a specific issue.'
    },
    convention2: {
        id: 'tw.feedback.convention2',
        defaultMessage: 'Submit substantive content. Feedback should address bug reports, feature suggestions, or usage experience. Spam, garbled text, pure emojis, and meaningless characters are not allowed.'
    },
    convention3: {
        id: 'tw.feedback.convention3',
        defaultMessage: 'No advertising. Marketing promotions, spam links, and off-topic content are prohibited.'
    },
    convention4: {
        id: 'tw.feedback.convention4',
        defaultMessage: 'Respect privacy and the law. Do not disclose others’ personal information, and do not post unlawful, violent, pornographic, or sensitive content.'
    },
    convention5: {
        id: 'tw.feedback.convention5',
        defaultMessage: 'Posting frequency. Each account may publish at most 3 feedback posts per day. Please use this quota responsibly.'
    },
    convention6: {
        id: 'tw.feedback.convention6',
        defaultMessage: 'Moderation. All published content is reviewed by AI. Content that fails review will not be displayed.'
    },
    convention7: {
        id: 'tw.feedback.convention7',
        defaultMessage: 'Username policy. A username, once set, cannot be changed for 45 days and must be globally unique.'
    },
    conventionAgree: {
        id: 'tw.feedback.conventionAgree',
        defaultMessage: 'I have read and agree to the TwT Community Feedback Guidelines above.'
    },
    conventionBack: {
        id: 'tw.feedback.conventionBack',
        defaultMessage: 'Back'
    },
    enterArea: {
        id: 'tw.feedback.enterArea',
        defaultMessage: 'Enter TwT Feedback'
    },
    iKnow: {
        id: 'tw.feedback.iKnow',
        defaultMessage: 'I Understand'
    },
    namePlaceholder: {
        id: 'tw.feedback.namePlaceholder',
        defaultMessage: 'Set a username (globally unique, 2-20 characters)'
    },
    saving: {
        id: 'tw.feedback.saving',
        defaultMessage: 'Saving…'
    },
    confirmChange: {
        id: 'tw.feedback.confirmChange',
        defaultMessage: 'Confirm'
    },
    setName: {
        id: 'tw.feedback.setName',
        defaultMessage: 'Set'
    },
    cancel: {
        id: 'tw.feedback.cancel',
        defaultMessage: 'Cancel'
    },
    noName: {
        id: 'tw.feedback.noName',
        defaultMessage: 'No username set'
    },
    changeNameTitle: {
        id: 'tw.feedback.changeNameTitle',
        defaultMessage: 'Can only be changed once every {days} days; {left} days left',
        description: 'Tooltip shown on the change-username button while in cooldown'
    },
    changeUsername: {
        id: 'tw.feedback.changeUsername',
        defaultMessage: 'Change username'
    },
    changeNameBtnCooldown: {
        id: 'tw.feedback.changeNameBtnCooldown',
        defaultMessage: 'Change (in {left} days)',
        description: 'Change-username button label while in cooldown'
    },
    change: {
        id: 'tw.feedback.change',
        defaultMessage: 'Change'
    },
    textPlaceholder: {
        id: 'tw.feedback.textPlaceholder',
        defaultMessage: 'Tell us about the problem you encountered or your suggestion…'
    },
    localMode: {
        id: 'tw.feedback.localMode',
        defaultMessage: 'Local mode'
    },
    remainingToday: {
        id: 'tw.feedback.remainingToday',
        defaultMessage: 'You can post {count} more today'
    },
    uploadImage: {
        id: 'tw.feedback.uploadImage',
        defaultMessage: 'Upload image'
    },
    image: {
        id: 'tw.feedback.image',
        defaultMessage: 'Image'
    },
    submitting: {
        id: 'tw.feedback.submitting',
        defaultMessage: 'Submitting'
    },
    submitFeedback: {
        id: 'tw.feedback.submitFeedback',
        defaultMessage: 'Post feedback'
    },
    loginRequired: {
        id: 'tw.feedback.loginRequired',
        defaultMessage: 'Please sign in with your email before posting feedback'
    },
    loading: {
        id: 'tw.feedback.loading',
        defaultMessage: 'Loading'
    },
    empty: {
        id: 'tw.feedback.empty',
        defaultMessage: 'No feedback yet. Be the first to post!'
    },
    delete: {
        id: 'tw.feedback.delete',
        defaultMessage: 'Delete'
    },
    replyPlaceholder: {
        id: 'tw.feedback.replyPlaceholder',
        defaultMessage: 'Reply…'
    },
    reply: {
        id: 'tw.feedback.reply',
        defaultMessage: 'Reply'
    },
    sending: {
        id: 'tw.feedback.sending',
        defaultMessage: 'Sending'
    },
    send: {
        id: 'tw.feedback.send',
        defaultMessage: 'Send'
    },
    offlineTitle: {
        id: 'tw.feedback.offlineTitle',
        defaultMessage: 'Network connection lost'
    },
    offlineText: {
        id: 'tw.feedback.offlineText',
        defaultMessage: 'TwT Feedback needs an internet connection to load and post. Please check your network and try again.'
    },
    retryConnect: {
        id: 'tw.feedback.retryConnect',
        defaultMessage: 'Retry connection'
    },
    stillOffline: {
        id: 'tw.feedback.stillOffline',
        defaultMessage: 'Still no network detected. Please check Wi-Fi or mobile data.'
    },
    timeJustNow: {
        id: 'tw.feedback.timeJustNow',
        defaultMessage: 'Just now'
    },
    timeMinutesAgo: {
        id: 'tw.feedback.timeMinutesAgo',
        defaultMessage: '{minutes} minutes ago'
    },
    timeHoursAgo: {
        id: 'tw.feedback.timeHoursAgo',
        defaultMessage: '{hours} hours ago'
    },
    timeDate: {
        id: 'tw.feedback.timeDate',
        defaultMessage: '{month}/{day} {hour}:{minute}'
    },
    fRealtimeLocal: {
        id: 'tw.feedback.fRealtimeLocal',
        defaultMessage: 'Realtime service unavailable, switched to local mode (visible on this device only)'
    },
    fNoUsernamesTable: {
        id: 'tw.feedback.fNoUsernamesTable',
        defaultMessage: 'Usernames table not found: please run the username setup SQL in Supabase first'
    },
    fNameCooldown: {
        id: 'tw.feedback.fNameCooldown',
        defaultMessage: 'A username can only be changed once every {days} days; {left} days left'
    },
    fNameMin: {
        id: 'tw.feedback.fNameMin',
        defaultMessage: 'Username must be at least 2 characters'
    },
    fNameMax: {
        id: 'tw.feedback.fNameMax',
        defaultMessage: 'Username must be at most 20 characters'
    },
    fNameSaved: {
        id: 'tw.feedback.fNameSaved',
        defaultMessage: 'Username saved'
    },
    fNameTaken: {
        id: 'tw.feedback.fNameTaken',
        defaultMessage: 'Username "{name}" is taken, please choose another'
    },
    fNameSaveFailed: {
        id: 'tw.feedback.fNameSaveFailed',
        defaultMessage: 'Save failed: {msg}'
    },
    fSupabaseLocal: {
        id: 'tw.feedback.fSupabaseLocal',
        defaultMessage: 'Cannot connect to Supabase ({reason}), switched to local mode'
    },
    fLoadFailed: {
        id: 'tw.feedback.fLoadFailed',
        defaultMessage: 'Load failed: {reason}'
    },
    fMaxImages: {
        id: 'tw.feedback.fMaxImages',
        defaultMessage: 'You can upload at most {count} images'
    },
    fSetNameFirst: {
        id: 'tw.feedback.fSetNameFirst',
        defaultMessage: 'Please set a username first'
    },
    fDailyLimit: {
        id: 'tw.feedback.fDailyLimit',
        defaultMessage: 'Daily feedback limit reached ({count} posts)'
    },
    submitCooldown: {
        id: 'tw.feedback.submitCooldown',
        defaultMessage: 'Please wait {seconds}s before posting again'
    },
    fReviewFailed: {
        id: 'tw.feedback.fReviewFailed',
        defaultMessage: 'Content did not pass review and cannot be posted (avoid meaningless, off-topic, or inappropriate content)'
    },
    fRateLimit: {
        id: 'tw.feedback.fRateLimit',
        defaultMessage: '切勿频繁操作'
    },
    fReviewUnavailablePublished: {
        id: 'tw.feedback.fReviewUnavailablePublished',
        defaultMessage: 'Review service is temporarily unavailable; posted directly'
    },
    fReviewUnavailable: {
        id: 'tw.feedback.fReviewUnavailable',
        defaultMessage: 'Review service is temporarily unavailable, please try again later'
    },
    fReviewAuthFail: {
        id: 'tw.feedback.fReviewAuthFail',
        defaultMessage: 'AI review API Key is invalid or unauthorized'
    },
    fReviewConnFail: {
        id: 'tw.feedback.fReviewConnFail',
        defaultMessage: 'Cannot reach the review service (api.yjs.im); check your network/proxy'
    },
    fSubmitted: {
        id: 'tw.feedback.fSubmitted',
        defaultMessage: 'Feedback submitted. Thank you!'
    },
    fSubmitLocal: {
        id: 'tw.feedback.fSubmitLocal',
        defaultMessage: 'Cannot connect to Supabase ({reason}); switched to local mode, please submit again'
    },
    fSubmitFailed: {
        id: 'tw.feedback.fSubmitFailed',
        defaultMessage: 'Submit failed: {reason}'
    },
    fLikeFailed: {
        id: 'tw.feedback.fLikeFailed',
        defaultMessage: 'Like failed'
    },
    fCommentFailed: {
        id: 'tw.feedback.fCommentFailed',
        defaultMessage: 'Comment failed'
    },
    fCommentProfanity: {
        id: 'tw.feedback.fCommentProfanity',
        defaultMessage: 'Comment contains inappropriate content and cannot be sent'
    },
    fCommentReviewUnavailable: {
        id: 'tw.feedback.fCommentReviewUnavailable',
        defaultMessage: 'Comment review service is temporarily unavailable, please try again later'
    },
    fOnlyDeleteOwn: {
        id: 'tw.feedback.fOnlyDeleteOwn',
        defaultMessage: 'You can only delete feedback you posted'
    },
    fDeleted: {
        id: 'tw.feedback.fDeleted',
        defaultMessage: 'Feedback deleted'
    },
    fDeleteFailed: {
        id: 'tw.feedback.fDeleteFailed',
        defaultMessage: 'Delete failed, please retry'
    },
    fCommentDeleted: {
        id: 'tw.feedback.fCommentDeleted',
        defaultMessage: 'Comment deleted'
    },
    /* 管理员相关 */
    fMarkedResolved: {
        id: 'tw.feedback.fMarkedResolved',
        defaultMessage: 'Marked as resolved'
    },
    fUnmarkedResolved: {
        id: 'tw.feedback.fUnmarkedResolved',
        defaultMessage: 'Removed resolved mark'
    },
    resolvedBadge: {
        id: 'tw.feedback.resolvedBadge',
        defaultMessage: 'Resolved'
    },
    markResolved: {
        id: 'tw.feedback.markResolved',
        defaultMessage: 'Mark resolved'
    },
    unmarkResolved: {
        id: 'tw.feedback.unmarkResolved',
        defaultMessage: 'Unmark'
    },
    fOnlyDeleteOwnComment: {
        id: 'tw.feedback.fOnlyDeleteOwnComment',
        defaultMessage: 'You can only delete your own comment or comments under your own feedback'
    },
    confirmDeleteComment: {
        id: 'tw.feedback.confirmDeleteComment',
        defaultMessage: 'Delete this comment? This cannot be undone.'
    },
    confirmDelete: {
        id: 'tw.feedback.confirmDelete',
        defaultMessage: 'Delete this feedback? This cannot be undone.'
    },
    anonName: {
        id: 'tw.feedback.anonName',
        defaultMessage: 'Anonymous'
    },
    removeImage: {
        id: 'tw.feedback.removeImage',
        defaultMessage: 'Remove image'
    }
});

function loadLiked () {
    try {
        return JSON.parse(localStorage.getItem(LIKED_KEY)) || {};
    } catch (e) {
        return {};
    }
}
function saveLiked (m) {
    try {
        localStorage.setItem(LIKED_KEY, JSON.stringify(m));
    } catch (e) { /* 忽略 */ }
}

// 频繁操作限流：记录每次「AI 审核使用」（仅文字发帖会触发服务端 AI 审核），
// 取最近 RATE_LIMIT_WINDOW_MS 内的时间戳，达到 RATE_LIMIT_MAX 即视为频繁操作。
function loadSubmitTimes () {
    try {
        return JSON.parse(localStorage.getItem(RATE_TS_KEY)) || [];
    } catch (e) {
        return [];
    }
}
function pruneSubmitTimes (arr, now) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    return arr.filter(t => t >= cutoff);
}
function saveSubmitTimes (arr) {
    try {
        localStorage.setItem(RATE_TS_KEY, JSON.stringify(arr));
    } catch (e) { /* 忽略 */ }
}

// 统一的人形头像（所有用户都用这一个图标）
// 亮色模式：深灰底浅色人形（用户指定）；暗色模式：白底深色人形（原版，不变）
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
                        id="twt-person-grad"
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
                            fill="url(#twt-person-grad)"
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
                    id="twt-person-grad-light"
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
                        fill="url(#twt-person-grad-light)"
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
// 断网离线界面用的「无 Wi-Fi / 已断开」插画（单色，跟随 CSS 当前主题色）
function OfflineSvg () {
    return (
        <svg
            className={styles.offlineSvg}
            viewBox="0 0 102.83138 77.33504"
            aria-hidden="true"
        >
            <g transform="translate(-193.23914,-143.55506)">
                <g fill="none" stroke="currentColor" strokeMiterlimit="10">
                    <path d="M240.04126,210.94495h-0.04126" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M198.73914,164.8153c23.49399,-21.01366 59.02773,-21.01366 82.52172,0" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M211.1174,181.48469c12.73838,-12.48611 31.54929,-15.05869 46.78998,-7.71776" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M225.5587,196.17356c5.65832,-5.54626 13.71298,-7.18047 20.78346,-4.90263" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                    <g strokeWidth="8" strokeLinejoin="miter">
                        <path d="M250.38938,196.04953c0,-11.50993 9.33065,-20.84058 20.84058,-20.84058c11.50993,0 20.84057,9.33065 20.84057,20.84058c0,11.50993 -9.33064,20.84057 -20.84057,20.84057c-11.50993,0 -20.84058,-9.33064 -20.84058,-20.84057z" strokeLinecap="butt" />
                        <path d="M282.11682,178.63054l-24.26216,32.97166" strokeLinecap="round" />
                    </g>
                </g>
            </g>
        </svg>
    );
}
// 头像组件：有自定义头像 URL 则显示圆形图片，否则回退到默认 PersonAvatar（暗/亮）
function UserAvatar ({url, isDark, className}) {
    if (url) {
        return (
            <img
                className={className || styles.avatarImg}
                src={url}
                draggable={false}
                alt=""
            />
        );
    }
    return <PersonAvatar isDark={isDark} />;
}
function flashIcon (type) {
    if (type === 'info') {
        // 蓝底提示专用图标（白色描边感叹号，跟随 .flashInfo 蓝紫渐变）
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
    if (/已保存|已提交|感谢|成功/i.test(msg)) return 'success';
    if (/上限|最多|至少|请先|还需|本地模式|冷却|建议|无法/i.test(msg)) return 'warn';
    return 'info';
}
function cap (s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtTime (ts, intl) {
    const now = Date.now();
    const diff = (now - ts) / 1000;
    if (diff < 60) return intl.formatMessage(messages.timeJustNow);
    if (diff < 3600) return intl.formatMessage(messages.timeMinutesAgo, {minutes: Math.floor(diff / 60)});
    if (diff < 86400) return intl.formatMessage(messages.timeHoursAgo, {hours: Math.floor(diff / 3600)});
    const d = new Date(ts);
    const p = n => (n < 10 ? '0' : '') + n;
    return intl.formatMessage(messages.timeDate, {
        month: d.getMonth() + 1,
        day: d.getDate(),
        hour: p(d.getHours()),
        minute: p(d.getMinutes())
    });
}

class FeedbackModalComponent extends React.Component {
    constructor (props) {
        super(props);
        this.deviceId = getDeviceId();
        let agreed = false;
        try {
            agreed = localStorage.getItem(AGREED_KEY) === '1';
        } catch (e) { /* 忽略 */ }
        this.state = {
            items: [],
            loading: true,
            mode: 'local',
            nameRecord: null,        // 已绑定的用户名：{name, name_updated_at} 或 null
            nameDraft: props.username || localStorage.getItem(NAME_KEY) || '',
            editingName: false,
            savingName: false,
            text: '',
            images: [], // {file, preview}
            submitting: false,
            likedMap: loadLiked(),
            likingIds: {}, // 正在处理点赞的帖子 id（防止连点刷赞）
            flash: '',
            flashType: 'info',
            flashKey: 0,
            flashLeaving: false,
            removingIds: {}, // 正在播放退场动画的帖子 id 集合
            commentingIds: {}, // 正在审核/发送的评论所属帖子 id 集合（防连点）
            agreed,                       // 是否已确认公约（持久化）
            showConvention: !agreed,     // 未确认则优先弹出公约
            agreeChecked: false,         // 公约勾选状态
            showLogin: false,            // 同意公约后、未登录时显示登录/注册界面
            offline: typeof navigator !== 'undefined' ? !navigator.onLine : false, // 是否断网
            offlineHint: '',              // 重试仍失败时的提示
            isAdmin: false,               // 当前登录账号是否为管理员（仅控制显示管理按钮）
            submitCooldownUntil: 0,       // 提交冷却截止时间戳(毫秒)
            rateLimitUntil: 0,            // 频繁操作禁发截止时间戳(毫秒)
            removing: {},                 // 正在播放退场动画的评论 key 集合（"帖子id:评论下标"）
            replyOpen: {},                // 已展开回复输入框的帖子 id 集合
            replyLeaving: {},             // 正在播放退场动画的回复输入框帖子 id 集合
            myAvatar: '',                // 当前用户自己的头像 URL（data URL 或 https URL）
            avatarMap: {}                // { [deviceId]: '头像URL' } —— 反馈区所有作者的头像批量缓存
        };
        this.store = null;
        this.fileInput = React.createRef();
        this._commentInputs = {};
        this._liking = new Set(); // 同步锁：防止用户快速连点导致重复点赞
        this._mounted = true;
    }

    componentDidMount () {
        this.store = createFeedbackStore();
        this.setState({mode: this.store.mode});
        if (this.store.mode === 'local') {
            this.flash(this.props.intl.formatMessage(messages.fRealtimeLocal), 'info');
        }
        this.loadUsername();
        this.refresh();
        if (this.store.subscribe) this.store.subscribe(() => this.refresh());
        this.tick = setInterval(() => this.setState({now: Date.now()}), 30000);
        // 合并 storage 事件监听，减少事件处理函数数量
        this._onStorage = e => {
            if (e.key === LIKED_KEY) this.setState({likedMap: loadLiked()});
            if (e.key === 'twt_avatar_url') this.loadMyAvatar();
        };
        window.addEventListener('storage', this._onStorage);
        // 头像全局实时更新：同页（自定义事件）与外标签页（storage）都监听
        this._onAvatarChanged = e => {
            if (!this._mounted) return;
            const url = (e && e.detail && e.detail.url) || '';
            this.setState(prev => {
                // 自己头像立即更新；同时如果 avatarMap 已含自己，也同步更新
                const map = Object.assign({}, prev.avatarMap);
                if (map[this.deviceId] !== undefined) map[this.deviceId] = url;
                return {myAvatar: url, avatarMap: map};
            });
        };
        window.addEventListener('twt-avatar-changed', this._onAvatarChanged);
        // 延迟加载头像，避免阻塞初始渲染
        queueMicrotask(() => this.loadMyAvatar());
        // 断网检测：监听浏览器 online/offline 事件，实时切换离线界面
        this._onOnline = () => {
            if (!this._mounted) return;
            this.setState({offline: false, offlineHint: ''});
            if (this.store) this.refresh();
        };
        this._onOffline = () => {
            if (!this._mounted) return;
            this.setState({offline: true, offlineHint: ''});
        };
        window.addEventListener('online', this._onOnline);
        window.addEventListener('offline', this._onOffline);
        // 查询当前登录账号是否为管理员（仅决定要不要显示管理按钮）
        if (isLoggedIn()) {
            getMyRole()
                .then(r => { if (this._mounted && r && r.role === 'admin') this.setState({isAdmin: true}); })
                .catch(() => { /* 查询失败按普通用户处理 */ });
        }
    }

    get myName () {
        return this.state.nameRecord ? this.state.nameRecord.name : '';
    }

    loadUsername () {
        if (!this.store || !this.store.getUsername) return;
        this.store.getUsername(this.deviceId)
            .then(rec => {
                if (rec && rec.name) {
                    this.setState({
                        nameRecord: {name: rec.name, name_updated_at: rec.name_updated_at},
                        editingName: false
                    });
                    try {
                        localStorage.setItem(NAME_KEY, rec.name);
                    } catch (e) { /* 忽略 */ }
                } else {
                    this.setState({editingName: true});
                }
            })
            .catch(err => {
                const body = err && err.body;
                if (body && body.code === '42P01') {
                    this.flash(this.props.intl.formatMessage(messages.fNoUsernamesTable), 'error');
                }
                // 读取失败时允许先进入设置态，不阻塞
                this.setState({editingName: true});
            });
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
    // 头像按主题明暗切换：暗色=白底原版，亮色=深灰底新头像
    avatarIsDark () {
        const theme = this.props.theme;
        return !!(theme && typeof theme.isDark === 'function' && theme.isDark());
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
        this.store.setUsername(this.deviceId, name)
            .then(rec => {
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

    componentWillUnmount () {
        this._mounted = false;
        if (this.tick) clearInterval(this.tick);
        if (this._onStorage) window.removeEventListener('storage', this._onStorage);
        if (this._onAvatarChanged) window.removeEventListener('twt-avatar-changed', this._onAvatarChanged);
        if (this._onOnline) window.removeEventListener('online', this._onOnline);
        if (this._onOffline) window.removeEventListener('offline', this._onOffline);
        if (this._submitCooldownTimer) clearTimeout(this._submitCooldownTimer);
        if (this._rateLimitTimer) clearTimeout(this._rateLimitTimer);
        this.state.images.forEach(img => {
            if (img.preview) URL.revokeObjectURL(img.preview);
        });
    }

    // 离线界面「重试连接」：重新探测 navigator.onLine，联网则退出离线态并刷新
    retryOnline () {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            this.setState({offline: false, offlineHint: ''});
            if (this.store) this.refresh();
            return;
        }
        this.setState({offlineHint: this.props.intl.formatMessage(messages.stillOffline)});
        clearTimeout(this._offlineHintTimer);
        this._offlineHintTimer = setTimeout(() => {
            if (this._mounted) this.setState({offlineHint: ''});
        }, 2800);
    }

    renderOffline () {
        return (
            <div className={styles.offline}>
                <div className={styles.offlineCard}>
                    <OfflineSvg />
                    <div className={styles.offlineTitle}>
                        <FormattedMessage {...messages.offlineTitle} />
                    </div>
                    <div className={styles.offlineText}>
                        <FormattedMessage {...messages.offlineText} />
                    </div>
                    <button
                        type="button"
                        className={styles.offlineRetry}
                        onClick={() => this.retryOnline()}
                    >
                        <FormattedMessage {...messages.retryConnect} />
                    </button>
                    {this.state.offlineHint ? (
                        <div className={styles.offlineHint}>{this.state.offlineHint}</div>
                    ) : null}
                </div>
            </div>
        );
    }

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

    // 若当前处于频繁操作禁发期，重新弹出蓝色「切勿频繁操作」提示（覆盖其他提示）
    flashRateLimitIfBlocked () {
        if (this.state.rateLimitUntil > Date.now()) {
            this.flash(this.props.intl.formatMessage(messages.fRateLimit), 'info');
        }
    }

    refresh () {
        if (!this.store) return;
        this.store.getAll()
            .then(list => {
                if (!this._mounted) return;
                this.setState({items: list, loading: false});
                this.loadAuthorAvatars(list);
            })
            .catch(err => {
                const reason = (err && err.message) ? err.message : String(err);
                if (this.store.mode === 'online' && this.store.fallbackToLocal) {
                    this.store.fallbackToLocal();
                    this.setState({mode: 'local'});
                    this.flash(this.props.intl.formatMessage(messages.fSupabaseLocal, {reason}), 'info');
                    this.refresh();
                    return;
                }
                this.setState({loading: false});
                this.flash(this.props.intl.formatMessage(messages.fLoadFailed, {reason}), 'error');
            });
    }

    // 加载当前用户自己的头像（data URL 或 https URL；localStorage 兜底）
    loadMyAvatar () {
        if (!this._mounted) return;
        getAvatar()
            .then(res => {
                if (!this._mounted) return;
                const url = (res && res.url) || '';
                this.setState(prev => {
                    const map = Object.assign({}, prev.avatarMap);
                    if (map[this.deviceId] !== undefined) map[this.deviceId] = url;
                    return {myAvatar: url, avatarMap: map};
                });
            })
            .catch(() => { /* 默认头像即可 */ });
    }

    // 批量拉取反馈区所有作者（帖子作者 + 评论作者）的公开头像，写入 avatarMap
    loadAuthorAvatars (list) {
        if (!this.store || !this.store.getUsernames || !Array.isArray(list)) return;
        const ids = new Set();
        list.forEach(item => {
            if (item.owner_id) ids.add(item.owner_id);
            if (Array.isArray(item.comments)) {
                item.comments.forEach(c => { if (c && c.owner_id) ids.add(c.owner_id); });
            }
        });
        if (ids.size === 0) return;
        this.store.getUsernames(Array.from(ids))
            .then(rows => {
                if (!this._mounted || !Array.isArray(rows)) return;
                const map = {};
                rows.forEach(r => {
                    if (r && r.device_id && r.avatar_url) map[r.device_id] = r.avatar_url;
                });
                this.setState(prev => ({avatarMap: Object.assign({}, prev.avatarMap, map)}));
            })
            .catch(() => { /* 头像缺失不阻塞列表展示 */ });
    }

    get remaining () {
        return Math.max(0, DAILY_LIMIT_COUNT - countToday(this.state.items, this.deviceId));
    }

    onNameDraftChange (e) {
        this.setState({nameDraft: e.target.value});
    }

    onTextChange (e) {
        this.setState({text: e.target.value});
    }

    onAgreeCheckChange (e) {
        this.setState({agreeChecked: e.target.checked});
    }

    onPickImages (e) {
        const files = Array.from(e.target.files || []);
        const room = MAX_IMAGES - this.state.images.length;
        if (room <= 0) {
            this.flash(this.props.intl.formatMessage(messages.fMaxImages, {count: MAX_IMAGES}), 'warn');
            e.target.value = '';
            return;
        }
        const picked = files.slice(0, room).map(file => ({
            file,
            preview: URL.createObjectURL(file)
        }));
        this.setState({images: this.state.images.concat(picked)});
        e.target.value = '';
    }

    removeImage (idx) {
        const images = this.state.images.slice();
        const removed = images.splice(idx, 1)[0];
        if (removed && removed.preview) URL.revokeObjectURL(removed.preview);
        this.setState({images});
    }

    triggerFileInput () {
        if (this.fileInput.current) this.fileInput.current.click();
    }

    canSubmit () {
        const hasContent = this.state.text.trim().length > 0 || this.state.images.length > 0;
        const cooldownDone = Date.now() >= this.state.submitCooldownUntil;
        const rateOk = Date.now() >= this.state.rateLimitUntil;
        return !this.state.submitting && hasContent && this.remaining > 0 && !!this.state.nameRecord && cooldownDone && rateOk;
    }

    onSubmit () {
        if (!this.state.nameRecord) {
            this.flash(this.props.intl.formatMessage(messages.fSetNameFirst), 'warn');
            this.setState({editingName: true});
            return;
        }
        // 频繁操作禁发：1 分钟内连续触发 AI 审核达上限，弹出蓝色提示并拦截
        if (Date.now() < this.state.rateLimitUntil) {
            this.flash(this.props.intl.formatMessage(messages.fRateLimit), 'info');
            return;
        }
        if (!this.canSubmit()) {
            if (this.remaining <= 0) {
                this.flash(this.props.intl.formatMessage(messages.fDailyLimit, {count: DAILY_LIMIT_COUNT}), 'warn');
            } else if (Date.now() < this.state.submitCooldownUntil) {
                const seconds = Math.ceil((this.state.submitCooldownUntil - Date.now()) / 1000);
                this.flash(this.props.intl.formatMessage(messages.submitCooldown, {seconds}), 'warn');
            }
            return;
        }
        const name = this.myName;
        const text = this.state.text.trim();
        const hasImages = this.state.images.length > 0;
        // 发帖审核与入库全部由服务端函数完成（AI 审核 + 每日上限 + 代写库），
        // 前端不再预审，避免重复消耗审核配额。
        this._doSubmit(name, text, hasImages);
    }

    _doSubmit (name, text, hasImages) {
        // 必须先通过邮箱验证（登录态）才能发帖
        if (!isLoggedIn()) {
            this.setState({showLogin: true});
            this.flash(this.props.intl.formatMessage(messages.loginRequired), 'info');
            return;
        }
        const token = (getSession() && getSession().token) || '';
        // 记录一次「发帖」并判定是否触发频繁操作禁发。
        // 无论文字还是图片、无论审核通过与否，每次成功发起的发帖都计数；达到阈值即禁发 1 分钟。
        if (text.length > 0 || hasImages) {
            const now = Date.now();
            const times = pruneSubmitTimes(loadSubmitTimes(), now);
            times.push(now);
            saveSubmitTimes(times);
            if (times.length >= RATE_LIMIT_MAX) {
                const until = now + RATE_LIMIT_BLOCK_MS;
                if (this._rateLimitTimer) clearTimeout(this._rateLimitTimer);
                this._rateLimitTimer = setTimeout(() => {
                    if (this._mounted) this.setState({rateLimitUntil: 0});
                }, RATE_LIMIT_BLOCK_MS);
                this.setState({rateLimitUntil: until});
                this.flash(this.props.intl.formatMessage(messages.fRateLimit), 'info');
            }
        }
        const currentImages = this.state.images;
        const cooldownUntil = Date.now() + SUBMIT_COOLDOWN_MS;
        if (this._submitCooldownTimer) clearTimeout(this._submitCooldownTimer);
        this._submitCooldownTimer = setTimeout(() => {
            if (this._mounted) this.setState({submitCooldownUntil: 0});
        }, SUBMIT_COOLDOWN_MS);
        this.setState({submitting: true, submitCooldownUntil: cooldownUntil});
        const uploadTasks = currentImages.length ?
            currentImages.map(img => this.store.uploadImage(img.file, token)) : [];
        Promise.all(uploadTasks)
            .then(urls => this.store.add({name, text, image_urls: urls, owner_id: this.deviceId}, token))
            .then(res => {
                // 服务端拦截（AI 审核不通过 / 每日上限）：清空输入但不回退本地模式
                if (res && res.status === 'rejected') {
                    currentImages.forEach(img => {
                        if (img.preview) URL.revokeObjectURL(img.preview);
                    });
                    this.setState({text: '', images: [], submitting: false});
                    if (res.reason === 'daily_limit') {
                        this.flash(this.props.intl.formatMessage(messages.fDailyLimit, {count: DAILY_LIMIT_COUNT}), 'warn');
                    } else {
                        this.flash(this.props.intl.formatMessage(messages.fReviewFailed), 'error');
                    }
                    this.flashRateLimitIfBlocked();
                    return;
                }
                currentImages.forEach(img => {
                    if (img.preview) URL.revokeObjectURL(img.preview);
                });
                this.setState({text: '', images: [], submitting: false});
                this.refresh();
                this.flash(this.props.intl.formatMessage(messages.fSubmitted), 'success');
                this.flashRateLimitIfBlocked();
            })
            .catch(err => {
                const reason = (err && err.message) ? err.message : String(err);
                if (this.store.mode === 'online' && this.store.fallbackToLocal) {
                    this.store.fallbackToLocal();
                    this.setState({mode: 'local'});
                    this.flash(this.props.intl.formatMessage(messages.fSubmitLocal, {reason}), 'warn');
                    this.setState({submitting: false});
                    return;
                }
                this.setState({submitting: false});
                this.flash(this.props.intl.formatMessage(messages.fSubmitFailed, {reason}), 'error');
                this.flashRateLimitIfBlocked();
            });
    }

    toggleLike (item) {
        const id = String(item.id);
        // 同步锁：同一帖子的点赞请求未结束前，拒绝任何新点击（防止连点刷赞）
        if (this._liking.has(id)) return;
        this._liking.add(id);

        const liked = !!this.state.likedMap[id];
        const nextLiked = !liked;
        const likedMap = Object.assign({}, this.state.likedMap);
        if (nextLiked) likedMap[id] = 1;
        else delete likedMap[id];
        saveLiked(likedMap);

        // 乐观更新：按下瞬间先把本地点赞数 +1/-1，等服务器回包后由 refresh() 用真实值覆盖；
        // 失败则在 catch 里回滚，保证最终以服务端为准、过程中也不出现错误数字（避免“按了还是 0”的延迟感）。
        const optimisticLikes = Math.max(0, item.likes + (nextLiked ? 1 : -1));
        this.setState({
            likedMap,
            likingIds: Object.assign({}, this.state.likingIds, {[id]: true}),
            items: this.state.items.map(x => (String(x.id) === id)
                ? Object.assign({}, x, {likes: optimisticLikes})
                : x)
        });

        this.store.like(id, nextLiked, this.deviceId)
            .then(() => {
                this.refresh();
                // 锁释放前多等一小会儿，避免请求刚结束就被连点绕过
                setTimeout(() => {
                    if (!this._mounted) return;
                    this._liking.delete(id);
                    const next = Object.assign({}, this.state.likingIds);
                    delete next[id];
                    this.setState({likingIds: next});
                }, 500);
            })
            .catch(() => {
                // 请求失败：回滚本地状态（点赞标记 + 计数），避免用户以为点赞成功
                const reverted = Object.assign({}, this.state.likedMap);
                if (nextLiked) delete reverted[id];
                else reverted[id] = 1;
                saveLiked(reverted);
                this.setState(prev => ({
                    likedMap: reverted,
                    items: prev.items.map(x => (String(x.id) === id)
                        ? Object.assign({}, x, {likes: item.likes})
                        : x)
                }));
                this.flash(this.props.intl.formatMessage(messages.fLikeFailed), 'error');
                // 失败也延迟释放锁，并清除禁用态
                setTimeout(() => {
                    if (!this._mounted) return;
                    this._liking.delete(id);
                    const next = Object.assign({}, this.state.likingIds);
                    delete next[id];
                    this.setState({likingIds: next});
                }, 500);
            });
    }

    onSendComment (item) {
        const id = String(item.id);
        // 必须先设置昵称（注册设备身份）才能评论：评论身份由服务端按设备密钥校验，匿名不可评论
        if (!this.state.nameRecord || !this.state.nameRecord.name) {
            this.flash(this.props.intl.formatMessage(messages.fSetNameFirst), 'warn');
            this.setState({editingName: true});
            return;
        }
        // 同步锁：同一帖子的评论审核/发送进行中，拒绝新点击（防连点刷评论）
        if (this.state.commentingIds[id]) return;
        const input = this._commentInputs[item.id];
        if (!input) return;
        const text = (input.value || '').trim();
        if (!text) return;
        const comment = {
            name: this.myName || this.props.intl.formatMessage(messages.anonName),
            text,
            time: Date.now(),
            owner_id: this.deviceId
        };
        const submit = () => {
            input.value = '';
            this.store.addComment(id, comment)
                .then(() => {
                    this._setCommenting(id, false);
                    this.refresh();
                })
                .catch(() => {
                    this._setCommenting(id, false);
                    this.flash(this.props.intl.formatMessage(messages.fCommentFailed), 'error');
                });
        };
        // 轻量审核：只拦截不文明内容；runModeration 内部已自动重试 3 次。
        // 若重试后仍拿不到判定（AI 持续不可用），为贯彻「不文明内容绝不发布」，
        // 这里【不放行】，保留用户输入并提示稍后重试（不调用 submit，避免漏拦）。
        this._setCommenting(id, true);
        moderateComment(text)
            .then(pass => {
                if (!pass) {
                    this._setCommenting(id, false);
                    this.flash(this.props.intl.formatMessage(messages.fCommentProfanity), 'error');
                    return;
                }
                submit();
            })
            .catch(() => {
                // 审核服务持续不可用：不发布、不清除输入，等恢复后用户可重试
                this._setCommenting(id, false);
                this.flash(this.props.intl.formatMessage(messages.fCommentReviewUnavailable), 'info');
            });
    }

    _setCommenting (id, on) {
        this.setState(s => {
            const next = Object.assign({}, s.commentingIds);
            if (on) next[id] = true;
            else delete next[id];
            return {commentingIds: next};
        });
    }

    // 展开/收起「回复输入框」：展开时渲染并播入场动画，收起时先播出场动画再卸载
    toggleReply (item) {
        const id = String(item.id);
        if (this.state.replyOpen[id]) {
            // 收起：先标记出场动画，动画播完再真正卸载（避免突兀消失）
            this.setState(prev => ({replyLeaving: {...prev.replyLeaving, [id]: true}}));
            if (this._replyCloseTimer) clearTimeout(this._replyCloseTimer);
            this._replyCloseTimer = setTimeout(() => {
                if (!this._mounted) return;
                this.setState(prev => {
                    const open = {...prev.replyOpen};
                    const leaving = {...prev.replyLeaving};
                    delete open[id];
                    delete leaving[id];
                    return {replyOpen: open, replyLeaving: leaving};
                });
            }, REPLY_ANIM_MS);
        } else {
            // 展开：渲染并播入场动画，同时自动聚焦输入框
            this.setState(prev => ({
                replyOpen: {...prev.replyOpen, [id]: true},
                replyLeaving: {...prev.replyLeaving, [id]: false}
            }));
            setTimeout(() => {
                const el = this._commentInputs[item.id];
                if (el && el.focus) el.focus();
            }, 60);
        }
    }

    onDelete (item) {
        const isAdmin = !!this.state.isAdmin;
        // 删除鉴权：必须是本人发布（owner_id 与当前终身 ID 一致）；管理员不受此限
        if (!isAdmin && item.owner_id && item.owner_id !== this.deviceId) {
            this.flash(this.props.intl.formatMessage(messages.fOnlyDeleteOwn), 'error');
            return;
        }
        if (!window.confirm(this.props.intl.formatMessage(messages.confirmDelete))) return;
        const id = String(item.id);
        // 先标记退场动画，动画播完再真正删除
        this.setState({removingIds: Object.assign({}, this.state.removingIds, {[id]: true})});
        setTimeout(() => {
            if (isAdmin) {
                // 管理员：走服务端 admin.js（service_role），对任意帖都能删
                adminCall('deleteFeedback', {id})
                    .then(res => {
                        if (res && res.ok) {
                            this.flash(this.props.intl.formatMessage(messages.fDeleted), 'info');
                            this.refresh();
                        } else {
                            this.flash(this.props.intl.formatMessage(messages.fDeleteFailed), 'error');
                        }
                    })
                    .catch(() => this.flash(this.props.intl.formatMessage(messages.fDeleteFailed), 'error'));
            } else {
                this.store.removeOwn(id)
                    .then(() => {
                        this.flash(this.props.intl.formatMessage(messages.fDeleted), 'info');
                        this.refresh();
                    })
                    .catch(() => this.flash(this.props.intl.formatMessage(messages.fDeleteFailed), 'error'));
            }
        }, 300);
    }

    // 管理员：切换「已处理」标记
    onToggleResolved (item) {
        if (!this.state.isAdmin) return;
        const id = String(item.id);
        const resolved = item.status === 'resolved';
        const action = resolved ? 'unmarkResolved' : 'markResolved';
        adminCall(action, {id})
            .then(res => {
                if (res && res.ok) {
                    this.flash(
                        this.props.intl.formatMessage(resolved ? messages.fUnmarkedResolved : messages.fMarkedResolved),
                        'success'
                    );
                    this.refresh();
                } else {
                    this.flash(this.props.intl.formatMessage(messages.fDeleteFailed), 'error');
                }
            })
            .catch(() => this.flash(this.props.intl.formatMessage(messages.fDeleteFailed), 'error'));
    }

    // 评论删除：评论作者本人，或该帖作者，均可删除
    onDeleteComment (item, index) {
        const comments = item.comments || [];
        const c = comments[index];
        if (!c) return;
        const isCommentAuthor = c.owner_id && c.owner_id === this.deviceId;
        const isPostAuthor = item.owner_id && item.owner_id === this.deviceId;
        if (!isCommentAuthor && !isPostAuthor) {
            this.flash(this.props.intl.formatMessage(messages.fOnlyDeleteOwnComment), 'error');
            return;
        }
        if (!window.confirm(this.props.intl.formatMessage(messages.confirmDeleteComment))) return;
        const id = String(item.id);
        const key = `${id}:${index}`;
        // 先播放退场动画，动画结束后再真正从数据里移除，体验更顺滑
        if (this._mounted) {
            this.setState(prev => ({removing: {...prev.removing, [key]: true}}));
        }
        setTimeout(() => {
            const current = (this.state.removing && this.state.removing[key]) || !this._mounted;
        this.store.deleteComment(id, c)
            .then(() => {
                    if (this._mounted) {
                        this.setState(prev => {
                            const r = {...prev.removing};
                            delete r[key];
                            return {removing: r};
                        });
                    }
                    this.flash(this.props.intl.formatMessage(messages.fCommentDeleted), 'info');
                    this.refresh();
                })
                .catch(() => {
                    if (this._mounted) {
                        this.setState(prev => {
                            const r = {...prev.removing};
                            delete r[key];
                            return {removing: r};
                        });
                    }
                    this.flash(this.props.intl.formatMessage(messages.fDeleteFailed), 'error');
                });
        }, COMMENT_REMOVE_MS);
    }

    onShowConventionFalse () {
        this.setState({showConvention: false});
    }

    agreeAndEnter () {
        // 首次进入必须先勾选确认；已确认过（"查看模式"）可直接关闭
        if (!this.state.agreed && !this.state.agreeChecked) return;
        try {
            localStorage.setItem(AGREED_KEY, '1');
        } catch (e) { /* 忽略 */ }
        this.setState({agreed: true, showConvention: false, agreeChecked: false}, () => {
            // 同意公约后：未登录则强制进入登录/注册界面
            if (!isLoggedIn()) {
                this.setState({showLogin: true});
            }
        });
    }

    render () {
        const {items, loading, mode, nameRecord, nameDraft, editingName, savingName,
            text, images, submitting, likedMap, flash} = this.state;
        const myName = this.myName;
        const remaining = this.remaining;
        const cooldownLeft = this.cooldownDaysLeft();
        return (
            <Modal
                className={styles.modalContent}
                onRequestClose={this.props.onClose}
                contentLabel={this.props.intl.formatMessage(messages.areaLabel)}
                id="feedbackModal"
            >
                {this.state.showConvention ? (
                    <div className={styles.convention}>
                        <div className={styles.conventionCard}>
                            <h2 className={styles.conventionTitle}>
                                <FormattedMessage {...messages.conventionTitle} />
                            </h2>
                            <div className={styles.conventionScroll}>
                                <ul className={styles.conventionList}>
                                    <li><FormattedMessage {...messages.convention1} /></li>
                                    <li><FormattedMessage {...messages.convention2} /></li>
                                    <li><FormattedMessage {...messages.convention3} /></li>
                                    <li><FormattedMessage {...messages.convention4} /></li>
                                    <li><FormattedMessage {...messages.convention5} /></li>
                                    <li><FormattedMessage {...messages.convention6} /></li>
                                    <li><FormattedMessage {...messages.convention7} /></li>
                                </ul>
                            </div>
                            <label className={styles.conventionCheck}>
                                <input
                                    type="checkbox"
                                    checked={this.state.agreeChecked}
                                    onChange={e => this.onAgreeCheckChange(e)}
                                />
                                <span><FormattedMessage {...messages.conventionAgree} /></span>
                            </label>
                            <div className={styles.conventionFoot}>
                                {this.state.agreed ? (
                                    <button
                                        type="button"
                                        className={styles.conventionBackBtn}
                                        onClick={() => this.onShowConventionFalse()}
                                    >
                                        <FormattedMessage {...messages.conventionBack} />
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className={styles.conventionEnterBtn}
                                    disabled={!this.state.agreeChecked}
                                    onClick={() => this.agreeAndEnter()}
                                >
                                    {this.state.agreed ? (
                                        <FormattedMessage {...messages.iKnow} />
                                    ) : (
                                        <FormattedMessage {...messages.enterArea} />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (this.state.showLogin || !isLoggedIn()) ? (
                <LoginModal
                    embedded
                    lang={this.props.intl.locale && this.props.intl.locale.startsWith('zh') ? 'zh' : 'en'}
                    onLogin={() => {
                        this.setState({showLogin: false});
                        this.loadUsername();
                        this.refresh();
                    }}
                    onClose={() => this.setState({showLogin: false})}
                />
            ) : this.state.offline ? (
                    this.renderOffline()
                ) : (
                    <React.Fragment>
                        {flash ? (
                        <div
                            key={this.state.flashKey}
                            className={`${styles.flash} ${styles['flash' + cap(this.state.flashType)]} ${this.state.flashLeaving ? styles.flashLeaving : ''}`}
                        >
                            <span className={styles.flashIcon}>{flashIcon(this.state.flashType)}</span>
                            <span className={styles.flashText}>{flash}</span>
                        </div>
                    ) : null}

                    <div className={styles.body}>
                    <div className={styles.composer}>
                        <div className={styles.composerHead}>
                            <div className={styles.avatar}>
                                <UserAvatar url={this.state.myAvatar} isDark={this.avatarIsDark()} />
                            </div>
                            {editingName ? (
                                <div className={styles.nameEditRow}>
                                    <input
                                        className={styles.nameInput}
                                        placeholder={this.props.intl.formatMessage(messages.namePlaceholder)}
                                        value={nameDraft}
                                        onChange={e => this.onNameDraftChange(e)}
                                        maxLength={20}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') this.onSaveName();
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className={styles.nameSaveBtn}
                                        disabled={savingName}
                                        onClick={() => this.onSaveName()}
                                    >
                                        {savingName ? this.props.intl.formatMessage(messages.saving) : (nameRecord ? this.props.intl.formatMessage(messages.confirmChange) : this.props.intl.formatMessage(messages.setName))}
                                    </button>
                                    {nameRecord ? (
                                        <button
                                            type="button"
                                            className={styles.nameCancelBtn}
                                            onClick={() => this.cancelEditName()}
                                        >
                                            {this.props.intl.formatMessage(messages.cancel)}
                                        </button>
                                    ) : null}
                                </div>
                            ) : (
                                <div className={styles.nameShowRow}>
                                    <span className={styles.nameText}>
                                        {myName || this.props.intl.formatMessage(messages.noName)}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.nameEditBtn}
                                        onClick={() => this.startEditName()}
                                        title={cooldownLeft > 0 ?
                                            this.props.intl.formatMessage(messages.changeNameTitle, {days: NAME_COOLDOWN_DAYS, left: cooldownLeft}) :
                                            this.props.intl.formatMessage(messages.changeUsername)}
                                    >
                                        {cooldownLeft > 0 ? this.props.intl.formatMessage(messages.changeNameBtnCooldown, {left: cooldownLeft}) : this.props.intl.formatMessage(messages.change)}
                                    </button>
                                </div>
                            )}
                        </div>
                        <textarea
                            className={styles.textArea}
                            placeholder={this.props.intl.formatMessage(messages.textPlaceholder)}
                            value={text}
                            onChange={e => this.onTextChange(e)}
                            rows={3}
                            maxLength={1000}
                        />
                        {images.length > 0 ? (
                            <div className={styles.imgRow}>
                                {images.map((img, i) => (
                                    <div
                                        className={styles.imgThumb}
                                        key={i}
                                    >
                                        <img
                                            src={img.preview}
                                            alt=""
                                        />
                                        <button
                                            type="button"
                                            className={styles.imgRemove}
                                            onClick={() => this.removeImage(i)}
                                            aria-label={this.props.intl.formatMessage(messages.removeImage)}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        <div className={styles.composerFoot}>
                            <span className={styles.remaining}>
                                {mode === 'local' ? this.props.intl.formatMessage(messages.localMode) : this.props.intl.formatMessage(messages.remainingToday, {count: remaining})}
                            </span>
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={styles.iconBtn}
                                    onClick={() => this.triggerFileInput()}
                                    title={this.props.intl.formatMessage(messages.uploadImage)}
                                    aria-label={this.props.intl.formatMessage(messages.uploadImage)}
                                >
                                    <svg
                                        className={styles.iconImage}
                                        viewBox="0 0 24 24"
                                        width="18"
                                        height="18"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                                        <circle cx="8.5" cy="8.5" r="1.5"/>
                                        <path d="M21 15l-5-5L5 21"/>
                                    </svg>
                                    <span className={styles.iconLabel}>
                                        <FormattedMessage {...messages.image} />
                                    </span>
                                </button>
                                <input
                                    ref={this.fileInput}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    onChange={e => this.onPickImages(e)}
                                />
                                <button
                                    type="button"
                                    className={styles.submitBtn}
                                    disabled={!this.canSubmit() || submitting}
                                    onClick={() => this.onSubmit()}
                                >
                                    {submitting ? (
                                        <span className={styles.btnLoading}>
                                            <span className={styles.btnSpinner} />
                                            {this.props.intl.formatMessage(messages.submitting)}
                                        </span>
                                    ) : this.props.intl.formatMessage(messages.submitFeedback)}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={styles.feed}>
                        {loading ? (
                            <div className={styles.loading}>
                                <div className={styles.spinner} />
                                <span className={styles.loadingText}>
                                    {this.props.intl.formatMessage(messages.loading)}
                                </span>
                            </div>
                        ) : null}
                        {!loading && items.length === 0 ? (
                            <div className={styles.empty}>
                                <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                                {this.props.intl.formatMessage(messages.empty)}
                            </div>
                        ) : null}
                        {items.map(item => {
                            const id = String(item.id);
                            const liked = !!likedMap[id];
                            const liking = !!this.state.likingIds[id];
                            // 本人发布：owner_id（终身 ID）与当前设备一致；昵称可变不影响
                            const isMine = !!item.owner_id && item.owner_id === this.deviceId;
                            const leaving = !!this.state.removingIds[id];
                            const isAdmin = !!this.state.isAdmin;
                            const canDelete = isAdmin || isMine;
                            const resolved = item.status === 'resolved';
                            return (
                                <div
                                    className={`${styles.post} ${leaving ? styles.postLeaving : ''} ${resolved ? styles.postResolved : ''}`}
                                    key={item.id}
                                >
                                    <div className={styles.postHead}>
                                        <div className={styles.avatar}>
                                            <UserAvatar
                                                url={this.state.avatarMap[item.owner_id]}
                                                isDark={this.avatarIsDark()}
                                            />
                                        </div>
                                        <div className={styles.postMeta}>
                                            <span className={styles.postName}>{item.name}</span>
                                            <span className={styles.postTime}>{fmtTime(item.time, this.props.intl)}</span>
                                        </div>
                                        {resolved ? (
                                            <span className={styles.resolvedBadge}>
                                                {this.props.intl.formatMessage(messages.resolvedBadge)}
                                            </span>
                                        ) : null}
                                        {isAdmin ? (
                                            <button
                                                type="button"
                                                className={styles.adminResolveBtn}
                                                onClick={() => this.onToggleResolved(item)}
                                            >
                                                {this.props.intl.formatMessage(resolved ? messages.unmarkResolved : messages.markResolved)}
                                            </button>
                                        ) : null}
                                        {canDelete ? (
                                            <button
                                                type="button"
                                                className={styles.delBtn}
                                                onClick={() => this.onDelete(item)}
                                            >
                                                {this.props.intl.formatMessage(messages.delete)}
                                            </button>
                                        ) : null}
                                    </div>
                                    {item.text ? (
                                        <div className={styles.postText}>{item.text}</div>
                                    ) : null}
                                    {item.image_urls && item.image_urls.length > 0 ? (
                                        <div className={styles.postImages}>
                                            {item.image_urls.map((src, i) => (
                                                <a
                                                    key={i}
                                                    href={src}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={styles.postImage}
                                                >
                                                    <img
                                                        src={src}
                                                        alt=""
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className={styles.postActions}>
                                        <button
                                            type="button"
                                            className={liked ? styles.likeBtnActive : styles.likeBtn}
                                            disabled={liking}
                                            onClick={() => this.toggleLike(item)}
                                        >
                                            <svg
                                                className={styles.heartIcon}
                                                viewBox="0 0 24 24"
                                                width="15"
                                                height="15"
                                                fill={liked ? 'currentColor' : 'none'}
                                                stroke="currentColor"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M12 21s-7.5-4.6-10-9.2C0.4 8.6 2 5 5.5 5 7.7 5 9.3 6.2 12 9c2.7-2.8 4.3-4 6.5-4C22 5 23.6 8.6 22 11.8 19.5 16.4 12 21 12 21z"/>
                                            </svg>
                                            {item.likes}
                                        </button>
                                        <button
                                            type="button"
                                            className={this.state.replyOpen[item.id] ? styles.commentCountActive : styles.commentCount}
                                            onClick={() => this.toggleReply(item)}
                                            aria-label={this.props.intl.formatMessage(messages.reply)}
                                        >
                                            <svg
                                                className={styles.actIcon}
                                                viewBox="0 0 24 24"
                                                width="15"
                                                height="15"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                            </svg>
                                            {item.comments ? item.comments.length : 0}
                                        </button>
                                    </div>
                                    {item.comments && item.comments.length > 0 ? (
                                        <div className={styles.comments}>
                                            {item.comments.map((c, i) => {
                                                const rkey = `${String(item.id)}:${i}`;
                                                const isRemoving = !!(this.state.removing && this.state.removing[rkey]);
                                                return (
                                                <div
                                                    className={`${styles.comment}${isRemoving ? ` ${styles.commentRemoving}` : ''}`}
                                                    key={i}
                                                >
                                                    <div className={styles.commentAvatar}>
                                                        <UserAvatar
                                                            url={this.state.avatarMap[c.owner_id]}
                                                            isDark={this.avatarIsDark()}
                                                            className={styles.commentAvatarImg}
                                                        />
                                                    </div>
                                                    <div className={styles.commentBody}>
                                                        <span className={styles.commentName}>{c.name}</span>
                                                        <span className={styles.commentText}>{c.text}</span>
                                                        <span className={styles.commentTime}>
                                                            {fmtTime(c.time || Date.now(), this.props.intl)}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className={styles.commentDelete}
                                                        title={this.props.intl.formatMessage(messages.delete)}
                                                        aria-label={this.props.intl.formatMessage(messages.delete)}
                                                        onClick={() => this.onDeleteComment(item, i)}
                                                    >
                                                        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                                                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                    {(this.state.replyOpen[item.id] || this.state.replyLeaving[item.id]) && (
                                        <div
                                            className={`${styles.commentInputRow} ${this.state.replyLeaving[item.id] ? styles.replyLeave : styles.replyEnter}`}
                                        >
                                            <input
                                                className={styles.commentInput}
                                                placeholder={this.props.intl.formatMessage(messages.replyPlaceholder)}
                                                maxLength={300}
                                                ref={el => { this._commentInputs[item.id] = el; }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') this.onSendComment(item);
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className={styles.commentSend}
                                                disabled={this.state.commentingIds[item.id]}
                                                onClick={() => this.onSendComment(item)}
                                            >
                                                {this.state.commentingIds[item.id] ? (
                                                    <span className={styles.btnLoading}>
                                                        <span className={styles.btnSpinner} />
                                                        {this.props.intl.formatMessage(messages.sending)}
                                                    </span>
                                                ) : this.props.intl.formatMessage(messages.send)}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                </React.Fragment>
                )}
            </Modal>
        );
    }
}

FeedbackModalComponent.propTypes = {
    onClose: PropTypes.func.isRequired,
    username: PropTypes.string,
    theme: PropTypes.object
};

export default injectIntl(FeedbackModalComponent);
