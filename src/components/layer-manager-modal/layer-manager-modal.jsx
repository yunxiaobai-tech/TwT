import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import styles from './layer-manager-modal.css';

const messages = defineMessages({
    title: {
        id: 'tw.layerManager.title',
        description: 'Title of the layer manager modal',
        defaultMessage: 'Layer Manager'
    },
    moveUp: {
        id: 'tw.layerManager.moveUp',
        description: 'Button to move a sprite one layer forward',
        defaultMessage: 'Move forward'
    },
    moveDown: {
        id: 'tw.layerManager.moveDown',
        description: 'Button to move a sprite one layer backward',
        defaultMessage: 'Move backward'
    },
    empty: {
        id: 'tw.layerManager.empty',
        description: 'Shown when there are no sprites',
        defaultMessage: 'No sprites to arrange'
    },
    layerNumber: {
        id: 'tw.layerManager.layerNumber',
        description: 'Current layer position of a sprite',
        defaultMessage: 'Layer {n}'
    }
});

class LayerManagerModalComponent extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            targets: this.getTargets()
        };
        this._rowRefs = {};
        this._prevRects = null;
        this.handleTargetsUpdate = this.handleTargetsUpdate.bind(this);
        this.moveToPosition = this.moveToPosition.bind(this);
        this.commitLayer = this.commitLayer.bind(this);
        this.updateStageDrawOrder = this.updateStageDrawOrder.bind(this);
        this.captureRowRects = this.captureRowRects.bind(this);
    }
    componentDidMount () {
        if (this.props.vm && this.props.vm.runtime) {
            this.props.vm.runtime.on('targetsUpdate', this.handleTargetsUpdate);
        }
    }
    componentWillUnmount () {
        if (this.props.vm && this.props.vm.runtime) {
            this.props.vm.runtime.off('targetsUpdate', this.handleTargetsUpdate);
        }
    }
    getTargets () {
        if (!this.props.vm || !this.props.vm.runtime) return [];
        const runtime = this.props.vm.runtime;
        const sprites = runtime.targets.filter(t => !t.isStage);
        const renderer = this.props.vm.renderer;
        if (renderer && typeof renderer.getDrawableOrder === 'function') {
            // Derive the display order from the renderer's ACTUAL drawable order so the
            // modal reflects the real on-stage layer order. This is intentionally
            // independent of runtime.targets, which drives the left sprite CARD list and
            // must NOT change when a layer is moved (only the stage z-order changes).
            const ordered = sprites.slice().sort((a, b) => {
                const oa = renderer.getDrawableOrder(a.drawableID);
                const ob = renderer.getDrawableOrder(b.drawableID);
                return (oa == null ? 0 : oa) - (ob == null ? 0 : ob);
            });
            // ordered is back -> front; the modal lists front -> back (top = front).
            return ordered.reverse();
        }
        return sprites.reverse();
    }
    handleTargetsUpdate () {
        this.setState({targets: this.getTargets()});
    }
    componentDidUpdate (prevProps, prevState) {
        // FLIP animation: when the list order changed, slide each row from its old
        // position to its new one instead of jumping.
        if (this.state.targets !== prevState.targets && this._prevRects) {
            const refs = this._rowRefs;
            Object.keys(refs).forEach(id => {
                const el = refs[id];
                if (!el) return;
                const prevTop = this._prevRects[id];
                if (typeof prevTop !== 'number') return;
                const newTop = el.getBoundingClientRect().top;
                const delta = prevTop - newTop;
                if (!delta) return;
                el.style.transition = 'none';
                el.style.transform = `translateY(${delta}px)`;
                // Force a reflow so the start transform is committed before transitioning.
                void el.offsetWidth;
                requestAnimationFrame(() => {
                    el.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    el.style.transform = '';
                });
            });
            this._prevRects = null;
        }
    }
    captureRowRects () {
        this._prevRects = {};
        const refs = this._rowRefs;
        Object.keys(refs).forEach(id => {
            const el = refs[id];
            if (el) this._prevRects[id] = el.getBoundingClientRect().top;
        });
    }
    moveToPosition (fromPosition, toPosition) {
        const vm = this.props.vm;
        if (!vm || !vm.runtime) return;
        const count = this.state.targets.length;
        if (count <= 1) return;
        // Clamp the destination to [1, count] (count = number of sprite cards), so the
        // entered layer value can never exceed the maximum.
        const to = Math.max(1, Math.min(count, toPosition));
        if (to === fromPosition) return;
        // Reorder ONLY the local display list (front -> back). Do NOT mutate runtime.targets
        // and do NOT emit targetsUpdate — that would move the left sprite CARD list, which the
        // user does not want. Only the on-stage z-order (renderer drawable order) changes.
        const list = this.state.targets.slice();
        const [moved] = list.splice(fromPosition - 1, 1);
        list.splice(to - 1, 0, moved);
        this.captureRowRects();
        this.setState({targets: list});
        // Re-assign the renderer drawable order from the new list so the stage updates.
        this.updateStageDrawOrder(vm, list.slice().reverse());
    }
    updateStageDrawOrder (vm, orderedTargets) {
        const renderer = vm.renderer;
        if (!renderer || typeof renderer.setDrawableOrder !== 'function') return;
        const group = renderer._layerGroups && renderer._layerGroups.sprite;
        const startIndex = (group && typeof group.drawListOffset === 'number') ? group.drawListOffset : 0;
        // orderedTargets is back -> front, so index 0 is back-most, index count-1 is front-most.
        orderedTargets.forEach((target, i) => {
            if (target.drawableID === undefined || target.drawableID === null) return;
            renderer.setDrawableOrder(target.drawableID, startIndex + i, 'sprite');
        });
    }
    commitLayer (target, rawValue) {
        const total = this.state.targets.length;
        const n = parseInt(rawValue, 10);
        if (isNaN(n)) return;
        const fromPosition = this.state.targets.findIndex(t => t.id === target.id) + 1;
        // n is a 1-based layer (1 = front); clamp to [1, total] so it can never exceed max.
        this.moveToPosition(fromPosition, n);
    }
    render () {
        const {
            intl,
            onClose,
            sprites
        } = this.props;
        const {targets} = this.state;
        const total = targets.length;

        return (
            <Modal
                className={styles.modalContent}
                contentLabel={intl.formatMessage(messages.title)}
                onRequestClose={onClose}
                id="layer-manager"
            >
                <div className={styles.body}>
                    {total === 0 ? (
                        <div className={styles.empty}>{intl.formatMessage(messages.empty)}</div>
                    ) : (
                        <ul className={styles.list}>
                            {targets.map((target, index) => {
                                const position = index + 1;
                                const spriteEntry = sprites && sprites[target.id];
                                const costume = spriteEntry && spriteEntry.costume;
                                const asset = costume && costume.asset;
                                let costumeUrl = null;
                                if (asset && typeof asset.encodeDataURI === 'function') {
                                    costumeUrl = asset.encodeDataURI();
                                } else if (costume && costume.url) {
                                    costumeUrl = costume.url;
                                }
                                const spriteName = (typeof target.getName === 'function' && target.getName()) ||
                                    (spriteEntry && spriteEntry.name) || '';
                                const isFront = position === 1;
                                const isBack = position === total;
                                return (
                                    <li
                                        key={target.id}
                                        ref={el => {
                                            this._rowRefs[target.id] = el;
                                        }}
                                        className={styles.row}
                                    >
                                        <span className={styles.thumb}>
                                            {costumeUrl ? (
                                                <img
                                                    src={costumeUrl}
                                                    alt=""
                                                    draggable={false}
                                                />
                                            ) : null}
                                        </span>
                                        <span className={styles.info}>
                                            <span className={styles.name}>{spriteName}</span>
                                            <span className={styles.layer}>
                                                <input
                                                    type="number"
                                                    className={styles.layerInput}
                                                    min={1}
                                                    max={total}
                                                    defaultValue={position}
                                                    key={`${target.id}-${position}`}
                                                    aria-label={intl.formatMessage(messages.layerNumber, {n: position})}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            e.target.blur();
                                                        }
                                                    }}
                                                    onChange={e => {
                                                        // Clamp the typed value to [1, total] as the user types,
                                                        // so a value larger than the number of sprites (e.g. 3 when
                                                        // only 2 exist) can never be entered at all.
                                                        const v = parseInt(e.target.value, 10);
                                                        if (isNaN(v)) return;
                                                        if (v < 1) e.target.value = '1';
                                                        else if (v > total) e.target.value = String(total);
                                                    }}
                                                    onBlur={e => this.commitLayer(target, e.target.value)}
                                                />
                                            </span>
                                        </span>
                                        <span className={styles.actions}>
                                            <button
                                                type="button"
                                                className={styles.moveBtn}
                                                disabled={isFront}
                                                aria-label={intl.formatMessage(messages.moveUp)}
                                                title={intl.formatMessage(messages.moveUp)}
                                                onClick={() => this.moveToPosition(position, position - 1)}
                                            >
                                                <svg viewBox="0 0 20 20" aria-hidden="true">
                                                    <path
                                                        d="M10 5 L15 11 L5 11 Z"
                                                        fill="currentColor"
                                                    />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.moveBtn}
                                                disabled={isBack}
                                                aria-label={intl.formatMessage(messages.moveDown)}
                                                title={intl.formatMessage(messages.moveDown)}
                                                onClick={() => this.moveToPosition(position, position + 1)}
                                            >
                                                <svg viewBox="0 0 20 20" aria-hidden="true">
                                                    <path
                                                        d="M10 15 L5 9 L15 9 Z"
                                                        fill="currentColor"
                                                    />
                                                </svg>
                                            </button>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </Modal>
        );
    }
}

LayerManagerModalComponent.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func,
    sprites: PropTypes.object,
    vm: PropTypes.shape({
        runtime: PropTypes.object,
        reorderTarget: PropTypes.func
    })
};

export default injectIntl(LayerManagerModalComponent);
