import PropTypes from 'prop-types';
import React from 'react';
import ReactModal from 'react-modal';
import {injectIntl, intlShape} from 'react-intl';

import styles from './browser-modal.css';

const noop = () => {};

const BrowserModal = ({intl, ...props}) => {
    return (
        <ReactModal
            isOpen
            className={styles.modalContent}
            contentLabel=""
            overlayClassName={styles.modalOverlay}
            onRequestClose={noop}
        >
            <div dir={props.isRtl ? 'rtl' : 'ltr'} />
        </ReactModal>
    );
};

BrowserModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onClickDesktopSettings: PropTypes.func
};

const WrappedBrowserModal = injectIntl(BrowserModal);

WrappedBrowserModal.setAppElement = ReactModal.setAppElement;

export default WrappedBrowserModal;
