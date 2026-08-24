import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {closeFeedbackModal} from '../reducers/modals';
import FeedbackModalComponent from '../components/tw-feedback-modal/feedback-modal.jsx';

class FeedbackModal extends React.Component {
    render () {
        return (
            <FeedbackModalComponent
                onClose={this.props.onClose}
                username={this.props.username}
                theme={this.props.theme}
            />
        );
    }
}

FeedbackModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    username: PropTypes.string,
    theme: PropTypes.object
};

const mapStateToProps = state => ({
    username: (state.scratchGui && state.scratchGui.tw && state.scratchGui.tw.username) || '',
    theme: (state.scratchGui && state.scratchGui.theme && state.scratchGui.theme.theme) || null
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeFeedbackModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(FeedbackModal);
