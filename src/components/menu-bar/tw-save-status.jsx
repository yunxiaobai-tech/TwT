import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {isLoggedIn, getAvatar} from '../../lib/tw-auth-store.js';
import styles from './save-status.css';
import profileIconLight from './icon--profile-light.svg';
import profileIconDark from './icon--profile-dark.svg';
import loginIcon from './icon--login.svg';

const messages = defineMessages({
    login: {
        id: 'tw.menuBar.login',
        defaultMessage: 'Login',
        description: 'Text for the login button in the menu bar'
    },
    profileCenter: {
        id: 'tw.menuBar.profileCenter',
        defaultMessage: 'Profile',
        description: 'Tooltip and menu item for the profile center button in the menu bar'
    }
});

const DropdownCaret = () => (
    <svg
        className={styles.profileCaret}
        width="14"
        height="9"
        viewBox="0 0 14 9"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M1.5 1.5L7 7L12.5 1.5"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

class TWSaveStatus extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            menuOpen: false,
            avatar: ''
        };
        this.handleToggleMenu = this.handleToggleMenu.bind(this);
        this.handleOpenProfile = this.handleOpenProfile.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.handleStorageChange = this.handleStorageChange.bind(this);
        this.handleAvatarChanged = this.handleAvatarChanged.bind(this);
        this._mounted = true;
    }

    componentDidMount () {
        this._mounted = true;
        document.addEventListener('mousedown', this.handleClickOutside);
        window.addEventListener('storage', this.handleStorageChange);
        window.addEventListener('twt-avatar-changed', this.handleAvatarChanged);
        this.loadAvatar();
    }

    loadAvatar () {
        if (!isLoggedIn()) {
            if (this._mounted) this.setState({avatar: ''});
            return;
        }
        getAvatar()
            .then(res => {
                if (!this._mounted) return;
                this.setState({avatar: (res && res.url) || ''});
            })
            .catch(() => {
                if (this._mounted) this.setState({avatar: ''});
            });
    }

    componentWillUnmount () {
        this._mounted = false;
        document.removeEventListener('mousedown', this.handleClickOutside);
        window.removeEventListener('storage', this.handleStorageChange);
        window.removeEventListener('twt-avatar-changed', this.handleAvatarChanged);
    }

    handleAvatarChanged (event) {
        if (!this._mounted) return;
        const url = (event && event.detail && event.detail.url) || '';
        this.setState({avatar: url});
    }

    handleStorageChange () {
        // 其他标签页同步：重新拉取头像
        this.loadAvatar();
    }

    handleClickOutside (event) {
        if (this.wrapperRef && !this.wrapperRef.contains(event.target)) {
            this.setState({menuOpen: false});
        }
    }

    handleToggleMenu (event) {
        event.stopPropagation();
        this.setState(prev => ({menuOpen: !prev.menuOpen}));
    }

    handleOpenProfile () {
        this.setState({menuOpen: false});
        if (this.props.onClickProfile) this.props.onClickProfile();
    }

    render () {
        const {intl, theme, onClickLogin} = this.props;
        const loggedIn = isLoggedIn();
        const isDark = theme && typeof theme.isDark === 'function' ? theme.isDark() : false;
        const avatar = this.state.avatar;

        if (!loggedIn) {
            return (
                <div
                    className={styles.loginButton}
                    onClick={onClickLogin}
                    title={intl.formatMessage(messages.login)}
                >
                    <img
                        className={styles.loginIcon}
                        src={loginIcon}
                        draggable={false}
                        width={20}
                        height={20}
                        alt=""
                    />
                    <span className={styles.loginText}>
                        {intl.formatMessage(messages.login)}
                    </span>
                </div>
            );
        }

        return (
            <div
                className={styles.profileCenterWrap}
                ref={ref => {
                    this.wrapperRef = ref;
                }}
            >
                <div className={styles.profileCenter}>
                    <div
                        className={styles.profileAvatarArea}
                        onClick={this.handleOpenProfile}
                        title={intl.formatMessage(messages.profileCenter)}
                    >
                        {avatar ? (
                            <img
                                className={styles.profileAvatar}
                                src={avatar}
                                draggable={false}
                                width={28}
                                height={28}
                                alt=""
                            />
                        ) : (
                            <img
                                className={styles.profileAvatar}
                                src={isDark ? profileIconDark : profileIconLight}
                                draggable={false}
                                width={28}
                                height={28}
                                alt=""
                            />
                        )}
                    </div>
                    <div
                        className={styles.profileCaretArea}
                        onClick={this.handleToggleMenu}
                    >
                        <DropdownCaret />
                    </div>
                </div>
                {this.state.menuOpen && (
                    <div className={styles.profileDropdown}>
                        <div
                            className={styles.profileDropdownItem}
                            onClick={this.handleOpenProfile}
                        >
                            {intl.formatMessage(messages.profileCenter)}
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

TWSaveStatus.propTypes = {
    onClickLogin: PropTypes.func,
    onClickProfile: PropTypes.func,
    theme: PropTypes.shape({
        isDark: PropTypes.func
    }),
    intl: intlShape
};

const mapStateToProps = state => ({
    theme: state.scratchGui.theme.theme
});

export default connect(
    mapStateToProps,
    () => ({})
)(injectIntl(TWSaveStatus));
