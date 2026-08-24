import React from 'react';
import PropTypes from 'prop-types';
import render from '../app-target';
import styles from './changelog.css';

import {APP_NAME} from '../../lib/brand';
import {applyGuiColors} from '../../lib/themes/guiHelpers';
import {detectTheme} from '../../lib/themes/themePersistance';
import {CHANGELOG_DATA, TAG_LABEL, TAG_ICON} from './changelog-data.js';

applyGuiColors(detectTheme());
document.documentElement.lang = 'zh-cn';

const TAG_CLASS = {new: styles.tagNew, imp: styles.tagImp, fix: styles.tagFix, sec: styles.tagSec};

const ChangelogEntry = ({version, date, changes}) => (
    <section className={styles.entry}>
        <div className={styles.versionRow}>
            <h2 className={styles.version}>{version}</h2>
            <span className={styles.date}>{date}</span>
        </div>
        <ul className={styles.list}>
            {changes.map((change, index) => (
                <li key={index} className={styles.item}>
                    <span className={`${styles.tag} ${TAG_CLASS[change.tag] || styles.tagImp}`}>
                        <span className={styles.tagIcon} aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d={TAG_ICON[change.tag]} /></svg>
                        </span>
                        {TAG_LABEL[change.tag] || '改进'}
                    </span>
                    <span className={styles.itemText}>{change.text}</span>
                </li>
            ))}
        </ul>
    </section>
);

ChangelogEntry.propTypes = {
    version: PropTypes.string.isRequired,
    date: PropTypes.string,
    changes: PropTypes.arrayOf(PropTypes.shape({
        tag: PropTypes.string,
        text: PropTypes.string
    })).isRequired
};

const Changelog = () => (
    <main className={styles.main}>
        <header className={styles.headerContainer}>
            <h1 className={styles.headerText}>{APP_NAME} 更新日志</h1>
        </header>
        <div className={styles.content}>
            {CHANGELOG_DATA.map((entry, index) => (
                <ChangelogEntry key={index} {...entry} />
            ))}
        </div>
        <footer className={styles.footer}>
            <a href="index.html" className={styles.backLink}>返回作品界面</a>
        </footer>
    </main>
);

render(<Changelog />);
