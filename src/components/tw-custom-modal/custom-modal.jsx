import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, defineMessages, injectIntl} from 'react-intl';
import Modal from '../../containers/modal.jsx';
import styles from './custom-modal.css';
import centerMenuBarIcon from './center-menu-bar-icon.svg';
import consolidateFeaturesIcon from './consolidate-features-icon.svg';

const messages = defineMessages({
    title: {
        defaultMessage: '个性化',
        description: 'Title of custom modal',
        id: 'tw.customModal.title'
    }
});

const CustomModalComponent = props => (
    <Modal
        className={styles.modalContent}
        onRequestClose={props.onClose}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="customModal"
    >
        <div className={styles.body}>
            <div className={styles.optionRow}>
                <div className={styles.optionLeft}>
                    <div className={styles.optionIconWrap}>
                        <img
                            src={centerMenuBarIcon}
                            alt=""
                            draggable={false}
                        />
                    </div>
                    <div className={styles.optionText}>
                        <span className={styles.optionLabel}>
                            <FormattedMessage
                                defaultMessage="居中顶栏"
                                description="Center menu bar option"
                                id="tw.customModal.centerMenuBar"
                            />
                        </span>
                        <span className={styles.optionDesc}>
                            <FormattedMessage
                                defaultMessage="将顶栏按钮移动到屏幕中间"
                                description="Center menu bar option description"
                                id="tw.customModal.centerMenuBarDesc"
                            />
                        </span>
                    </div>
                </div>
                <label className={styles.toggleSwitch}>
                    <input
                        type="checkbox"
                        checked={props.centerMenuBar}
                        onChange={props.onCenterMenuBarChange}
                    />
                    <span className={styles.toggleSlider} />
                </label>
            </div>
            <div className={styles.optionRow}>
                <div className={styles.optionLeft}>
                    <div className={styles.optionIconWrap}>
                        <img
                            src={consolidateFeaturesIcon}
                            alt=""
                            draggable={false}
                        />
                    </div>
                    <div className={styles.optionText}>
                        <span className={styles.optionLabel}>
                            <FormattedMessage
                                defaultMessage="功能归集"
                                description="Consolidate features option"
                                id="tw.customModal.consolidateFeatures"
                            />
                        </span>
                        <span className={styles.optionDesc}>
                            <FormattedMessage
                                defaultMessage="将作品按钮和反馈按钮归集到菜单中"
                                description="Consolidate features option description"
                                id="tw.customModal.consolidateFeaturesDesc"
                            />
                        </span>
                    </div>
                </div>
                <label className={styles.toggleSwitch}>
                    <input
                        type="checkbox"
                        checked={props.consolidateFeatures}
                        onChange={props.onConsolidateFeaturesChange}
                    />
                    <span className={styles.toggleSlider} />
                </label>
            </div>
        </div>
    </Modal>
);

CustomModalComponent.propTypes = {
    intl: PropTypes.shape({
        formatMessage: PropTypes.func.isRequired
    }),
    onClose: PropTypes.func.isRequired,
    centerMenuBar: PropTypes.bool,
    onCenterMenuBarChange: PropTypes.func,
    consolidateFeatures: PropTypes.bool,
    onConsolidateFeaturesChange: PropTypes.func
};

export default injectIntl(CustomModalComponent);
