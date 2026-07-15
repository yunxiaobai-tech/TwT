import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './menu.css';

const MenuComponent = ({
    className = '',
    children,
    componentRef,
    place = 'right'
}) => (
    <ul
        className={classNames(
            styles.menu,
            className,
            {
                [styles.left]: place === 'left',
                [styles.right]: place === 'right'
            }
        )}
        ref={componentRef}
    >
        {children}
    </ul>
);

MenuComponent.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    componentRef: PropTypes.func,
    place: PropTypes.oneOf(['left', 'right'])
};


const Submenu = ({children, className, place, ...props}) => (
    <div
        className={classNames(
            styles.submenu,
            className,
            {
                [styles.left]: place === 'left',
                [styles.right]: place === 'right'
            }
        )}
    >
        <MenuComponent
            place={place}
            {...props}
        >
            {children}
        </MenuComponent>
    </div>
);

Submenu.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    place: PropTypes.oneOf(['left', 'right'])
};

const MenuItem = ({
    children,
    className,
    expanded = false,
    onClick
}) => {
    const itemRef = React.useRef(null);

    const handleMouseDown = () => {
        const el = itemRef.current;
        if (!el) return;
        el.dataset.menuDown = '1';
        const rect = el.getBoundingClientRect();
        el.dataset.menuRect = JSON.stringify({
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom
        });
    };

    const handleMouseUp = e => {
        const el = itemRef.current;
        if (!el || el.dataset.menuDown !== '1') return;
        const rect = JSON.parse(el.dataset.menuRect);
        delete el.dataset.menuDown;
        delete el.dataset.menuRect;

        const x = e.clientX;
        const y = e.clientY;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            if (onClick) onClick(e);
        }
    };

    return (
        <li
            ref={itemRef}
            className={classNames(
                styles.menuItem,
                styles.hoverable,
                className,
                {[styles.expanded]: expanded}
            )}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        >
            {children}
        </li>
    );
};

MenuItem.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    expanded: PropTypes.bool,
    onClick: PropTypes.func
};


const addDividerClassToFirstChild = (child, id) => (
    child && React.cloneElement(child, {
        className: classNames(
            child.className,
            {[styles.menuSection]: id === 0}
        ),
        key: id
    })
);

const MenuSection = ({children}) => (
    <React.Fragment>{
        React.Children.map(children, addDividerClassToFirstChild)
    }</React.Fragment>
);

MenuSection.propTypes = {
    children: PropTypes.node
};

export {
    MenuComponent as default,
    MenuItem,
    MenuSection,
    Submenu
};
