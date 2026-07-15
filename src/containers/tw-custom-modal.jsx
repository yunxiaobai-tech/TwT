import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {closeCustomModal} from '../reducers/modals';
import {setCenterMenuBar, setConsolidateFeatures} from '../reducers/tw';
import CustomModalComponent from '../components/tw-custom-modal/custom-modal.jsx';

class CustomModal extends React.Component {
    render () {
        return (
            <CustomModalComponent
                onClose={this.props.onClose}
                centerMenuBar={this.props.centerMenuBar}
                onCenterMenuBarChange={this.props.onCenterMenuBarChange}
                consolidateFeatures={this.props.consolidateFeatures}
                onConsolidateFeaturesChange={this.props.onConsolidateFeaturesChange}
            />
        );
    }
}

CustomModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    centerMenuBar: PropTypes.bool,
    onCenterMenuBarChange: PropTypes.func,
    consolidateFeatures: PropTypes.bool,
    onConsolidateFeaturesChange: PropTypes.func
};

const mapStateToProps = state => ({
    centerMenuBar: state.scratchGui.tw.centerMenuBar,
    consolidateFeatures: state.scratchGui.tw.consolidateFeatures
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeCustomModal()),
    onCenterMenuBarChange: e => dispatch(setCenterMenuBar(e.target.checked)),
    onConsolidateFeaturesChange: e => dispatch(setConsolidateFeatures(e.target.checked))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(CustomModal);
