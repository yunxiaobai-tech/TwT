import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, defineMessages, injectIntl} from 'react-intl';
import Modal from '../../containers/modal.jsx';
import styles from './custom-modal.css';
import centerMenuBarIcon from './center-menu-bar-icon.svg';
import stageLeftIcon from './stage-left-icon.svg';

const messages = defineMessages({
    title: {
        defaultMessage: 'Personalization',
        description: 'Title of custom modal',
        id: 'tw.customModal.title'
    },
    centerMenuBar: {
        defaultMessage: 'Center menu bar',
        description: 'Center menu bar option',
        id: 'tw.customModal.centerMenuBar'
    },
    centerMenuBarDesc: {
        defaultMessage: 'Move the menu bar buttons to the center of the screen',
        description: 'Center menu bar option description',
        id: 'tw.customModal.centerMenuBarDesc'
    },
    stageLeft: {
        defaultMessage: 'Move stage to left',
        description: 'Stage left option',
        id: 'tw.customModal.stageLeft'
    },
    stageLeftDesc: {
        defaultMessage: 'Move the stage to the left side of the editor',
        description: 'Stage left option description',
        id: 'tw.customModal.stageLeftDesc'
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
                            <FormattedMessage {...messages.centerMenuBar} />
                        </span>
                        <span className={styles.optionDesc}>
                            <FormattedMessage {...messages.centerMenuBarDesc} />
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
                            src={stageLeftIcon}
                            alt=""
                            draggable={false}
                        />
                    </div>
                    <div className={styles.optionText}>
                        <span className={styles.optionLabel}>
                            <FormattedMessage {...messages.stageLeft} />
                        </span>
                        <span className={styles.optionDesc}>
                            <FormattedMessage {...messages.stageLeftDesc} />
                        </span>
                    </div>
                </div>
                <label className={styles.toggleSwitch}>
                    <input
                        type="checkbox"
                        checked={props.stageLeft}
                        onChange={props.onStageLeftChange}
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
    stageLeft: PropTypes.bool,
    onStageLeftChange: PropTypes.func
};

export default injectIntl(CustomModalComponent);
