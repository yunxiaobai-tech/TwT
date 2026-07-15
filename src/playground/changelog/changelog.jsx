import React from 'react';
import PropTypes from 'prop-types';
import render from '../app-target';
import styles from './changelog.css';

import {APP_NAME} from '../../lib/brand';
import {applyGuiColors} from '../../lib/themes/guiHelpers';
import {detectTheme} from '../../lib/themes/themePersistance';

applyGuiColors(detectTheme());
document.documentElement.lang = 'zh-cn';

// 在这里编辑更新日志；按时间倒序排列，最新版本放最前面。
// 每条改动用 { tag, text } 表示：tag 可选 'new'(新增) / 'imp'(改进) / 'fix'(修复)
const TAG_LABEL = {new: '新增', imp: '改进', fix: '修复'};
const TAG_CLASS = {new: styles.tagNew, imp: styles.tagImp, fix: styles.tagFix};

const CHANGELOG_DATA = [
    {
        version: 'v2024.7.15',
        date: '2024 年 7 月 15 日',
        changes: [
            {tag: 'new', text: '反馈区：可发布文字与图片反馈，支持点赞和评论'},
            {tag: 'new', text: '评论接入轻量 AI 审核，仅拦截不文明内容，其余正常放行'},
            {tag: 'new', text: '断网检测：无网络时显示离线界面，恢复连接后自动刷新'},
            {tag: 'new', text: '页脚新增「更新日志」入口，可在此查看版本变动'},
            {tag: 'imp', text: '点赞稳定性：修复连点可叠加点赞的漏洞，并支持多标签页同步'},
            {tag: 'imp', text: '头像统一为灰色人形图标，视觉更一致'},
            {tag: 'imp', text: '作品页脚声明改为：TwT 作为 TurboWarp 改版项目，与 TurboWarp 同样不属于 Scratch 官方'},
            {tag: 'fix', text: '发帖审核增加重试机制，降低 AI 抖动导致的漏审'}
        ]
    },
    {
        version: 'v2024.6.30',
        date: '2024 年 6 月 30 日',
        changes: [
            {tag: 'new', text: '基于 TurboWarp 搭建 TwT 改版编辑器'},
            {tag: 'new', text: '集成 Scratch 运行器与图形化编辑能力'}
        ]
    }
];

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
