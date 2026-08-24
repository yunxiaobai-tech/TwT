import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {closeCustomModal} from '../reducers/modals';
import {setCenterMenuBar, setStageLeft} from '../reducers/tw';
import SettingsStore from '../addons/settings-store-singleton';
import CustomModalComponent from '../components/tw-custom-modal/custom-modal.jsx';

// 该 addon 内部 id 与插件列表中的 "将舞台移到左侧" 一致
const STAGE_LEFT_ADDON_ID = 'editor-stage-left';

// 动画参数：整个编辑器容器 gui_flex-wrapper 的滑动过渡
const FLEX_WRAPPER_SELECTOR = '[class^="gui_flex-wrapper"]';
const ANIM_MS = 420;
const ANIM_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const SLIDE_PX = 44;

const clearInline = el => {
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
};

// 从 fromX 偏移滑入归位并淡入
const slideIn = (el, fromX) => {
    el.style.transition = 'none';
    el.style.transform = `translateX(${fromX}px)`;
    el.style.opacity = '0.4';
    // 强制 reflow 让上面的初始态生效，再启动过渡
    void el.offsetWidth;
    el.style.transition = `transform ${ANIM_MS}ms ${ANIM_EASE}, opacity ${ANIM_MS}ms ${ANIM_EASE}`;
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
    setTimeout(() => clearInline(el), ANIM_MS);
};

// 向 toX 方向滑出并淡出，结束后回调
const slideOut = (el, toX, done) => {
    el.style.transition = `transform ${ANIM_MS}ms ${ANIM_EASE}, opacity ${ANIM_MS}ms ${ANIM_EASE}`;
    el.style.transform = `translateX(${toX}px)`;
    el.style.opacity = '0';
    setTimeout(done, ANIM_MS);
};

// 即时启用/禁用插件：setAddonEnabled 只发 setting-changed（运行器不监听），
// 必须补发 addon-changed（带 dynamic 标志）才能即时加载/卸载运行器。
const applyStageLeftAddon = enabled => {
    SettingsStore.setAddonEnabled(STAGE_LEFT_ADDON_ID, enabled);
    SettingsStore.dispatchEvent(new CustomEvent('addon-changed', {
        detail: {
            addonId: STAGE_LEFT_ADDON_ID,
            dynamicEnable: enabled,
            dynamicDisable: !enabled
        }
    }));
};

class CustomModal extends React.Component {
    componentDidMount () {
        // 弹窗打开时，把插件当前实际启用状态同步到 redux（仅用于显示勾选）
        this.props.onStageLeftSync(SettingsStore.getAddonEnabled(STAGE_LEFT_ADDON_ID));
    }
    render () {
        return (
            <CustomModalComponent
                onClose={this.props.onClose}
                centerMenuBar={this.props.centerMenuBar}
                onCenterMenuBarChange={this.props.onCenterMenuBarChange}
                stageLeft={this.props.stageLeft}
                onStageLeftChange={this.props.onStageLeftChange}
            />
        );
    }
}

CustomModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    centerMenuBar: PropTypes.bool,
    onCenterMenuBarChange: PropTypes.func,
    stageLeft: PropTypes.bool,
    onStageLeftChange: PropTypes.func,
    onStageLeftSync: PropTypes.func
};

const mapStateToProps = state => ({
    centerMenuBar: state.scratchGui.tw.centerMenuBar,
    stageLeft: state.scratchGui.tw.stageLeft
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeCustomModal()),
    onCenterMenuBarChange: e => dispatch(setCenterMenuBar(e.target.checked)),
    // 仅同步 redux 状态（弹窗打开时调用，不重复触发插件）
    onStageLeftSync: enabled => dispatch(setStageLeft(enabled)),
    // 用户切换：更新 redux + 即时启用/禁用插件 + 双向滑动动画
    onStageLeftChange: e => {
        const enabled = e.target.checked;
        dispatch(setStageLeft(enabled));
        const el = document.querySelector(FLEX_WRAPPER_SELECTOR);
        if (!el) {
            applyStageLeftAddon(enabled);
            return;
        }
        if (enabled) {
            // 开启：注入插件（布局瞬间变为舞台在左）→ 从右侧滑入归位（视觉：向左移）
            applyStageLeftAddon(true);
            slideIn(el, SLIDE_PX);
        } else {
            // 关闭：先向右滑出淡出 → 卸载插件（布局瞬间变为舞台在右）→ 从左侧滑入归位（视觉：向右移）
            slideOut(el, SLIDE_PX, () => {
                applyStageLeftAddon(false);
                const el2 = document.querySelector(FLEX_WRAPPER_SELECTOR);
                if (el2) {
                    slideIn(el2, -SLIDE_PX);
                }
            });
        }
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(CustomModal);
