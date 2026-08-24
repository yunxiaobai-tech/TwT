import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import {injectIntl, intlShape} from 'react-intl';

import {CHANGELOG_DATA, TAG_LABEL, TAG_ICON} from '../../playground/changelog/changelog-data.js';
import styles from './changelog-modal.css';

const TAG_CLASS = {new: styles.tagNew, imp: styles.tagImp, fix: styles.tagFix, sec: styles.tagSec};

// 文件图标（内联 SVG path，零资源依赖）
const FILE_ICON = 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z M13 2v7h7';

const ChangelogModalComponent = ({intl, onClose}) => (
    <Modal
        className={styles.modalContent}
        contentLabel={intl.formatMessage({
            id: 'tw.footer.changelog',
            defaultMessage: '更新日志'
        })}
        onRequestClose={onClose}
        id="changelog"
    >
        <div className={styles.body}>
            {CHANGELOG_DATA.map((entry, index) => (
                <section
                    key={index}
                    className={styles.entry}
                >
                    <div className={styles.versionRow}>
                        <h2 className={styles.version}>{entry.version}</h2>
                        <span className={styles.date}>{entry.date}</span>
                    </div>
                    <div className={styles.divider} />
                    <ul className={styles.list}>
                        {entry.changes.map((change, i) => (
                            <li
                                key={i}
                                className={styles.item}
                            >
                                {change.tag !== 'imp' && (
                                    <span className={`${styles.tag} ${TAG_CLASS[change.tag] || ''}`}>
                                        <span className={styles.tagIcon} aria-hidden="true">
                                            <svg viewBox="0 0 24 24"><path d={TAG_ICON[change.tag]} /></svg>
                                        </span>
                                        {TAG_LABEL[change.tag] || '改进'}
                                    </span>
                                )}
                                <span className={styles.itemText}>{change.text}</span>
                            </li>
                        ))}
                    </ul>
                    {entry.files && (entry.files.modified?.length > 0 || entry.files.added?.length > 0) && (
                        <>
                            <div className={styles.divider} />
                            <div className={styles.filesSection}>
                                {entry.files.modified?.length > 0 && (
                                    <>
                                        <div className={styles.filesTitle}>修改的文件</div>
                                        <div className={styles.filesList}>
                                            {entry.files.modified.map((f, i) => (
                                                <span key={i} className={styles.fileChip}>
                                                    <span className={styles.fileIcon} aria-hidden="true">
                                                        <svg viewBox="0 0 24 24"><path d={FILE_ICON} /></svg>
                                                    </span>
                                                    {f}
                                                </span>
                                            ))}
                                        </div>
                                    </>
                                )}
                                {entry.files.added?.length > 0 && (
                                    <>
                                        <div className={styles.filesTitle}>新增的文件</div>
                                        <div className={styles.filesList}>
                                            {entry.files.added.map((f, i) => (
                                                <span key={i} className={`${styles.fileChip} ${styles.fileChipNew}`}>
                                                    <span className={styles.fileIcon} aria-hidden="true">
                                                        <svg viewBox="0 0 24 24"><path d={FILE_ICON} /></svg>
                                                    </span>
                                                    {f}
                                                </span>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </section>
            ))}
        </div>
    </Modal>
);

ChangelogModalComponent.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func
};

export default injectIntl(ChangelogModalComponent);
