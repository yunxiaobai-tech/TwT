/**
 * iOS-style accent color scheme
 * Based on Apple's Human Interface Guidelines color system
 */
const guiColors = {
    // iOS system blue as the primary accent
    'motion-primary': '#007AFF',
    'motion-primary-transparent': '#007AFFe6',
    'motion-tertiary': '#0055D4',

    // Accent color
    'looks-secondary': '#007AFF',
    'looks-transparent': '#007AFF59',
    'looks-light-transparent': '#007AFF26',
    'looks-secondary-dark': '#0062CC',

    // Extensions use iOS green
    'extensions-primary': '#34C759',
    'extensions-tertiary': '#28A745',
    'extensions-transparent': '#34C75959',
    'extensions-light': '#E8F9ED',

    // iOS system colors
    'ui-primary': '#F2F2F7',           /* iOS systemGroupedBackground */
    'ui-secondary': '#FFFFFF',          /* iOS secondarySystemGroupedBackground */
    'ui-tertiary': '#E5E5EA',           /* iOS separator */

    'ui-modal-overlay': 'rgba(0, 0, 0, 0.4)',
    'ui-modal-background': '#FFFFFF',
    'ui-modal-foreground': '#1C1C1E',   /* iOS label */
    'ui-modal-header-background': '#F2F2F7',
    'ui-modal-header-foreground': '#1C1C1E',

    'ui-white': '#FFFFFF',
    'ui-white-dim': 'rgba(255, 255, 255, 0.75)',
    'ui-white-transparent': 'rgba(255, 255, 255, 0.25)',
    'ui-transparent': 'rgba(255, 255, 255, 0)',

    'ui-black-transparent': 'rgba(60, 60, 67, 0.29)', /* iOS separator */

    'text-primary': '#1C1C1E',          /* iOS label */
    'text-primary-transparent': 'rgba(28, 28, 30, 0.75)',

    // Menu bar - iOS translucent navigation bar
    'menu-bar-background': 'rgba(249, 249, 249, 0.94)',
    'menu-bar-background-image': 'none',
    'menu-bar-foreground': '#1C1C1E',

    'assets-background': '#F2F2F7',
    'input-background': '#E5E5EA',
    'popover-background': '#FFFFFF',

    'shadow': 'rgba(0, 0, 0, 0.08)',

    'badge-background': '#E8F0FE',
    'badge-border': '#C4D7FC',

    'fullscreen-background': '#000000',
    'fullscreen-accent': '#1C1C1E',

    'page-background': '#F2F2F7',
    'page-foreground': '#1C1C1E',

    'project-title-inactive': 'rgba(28, 28, 30, 0.3)',
    'project-title-hover': 'rgba(28, 28, 30, 0.6)',

    'link-color': '#007AFF',

    // Icon filters for iOS style
    'filter-icon-black': 'none',
    'filter-icon-gray': 'grayscale(100%) opacity(0.5)',
    'filter-icon-white': 'none',

    // Red colors (for warnings/errors)
    'red-primary': '#FF3B30',           /* iOS systemRed */
    'red-tertiary': '#D70015',

    'error-primary': '#FF3B30',
    'error-light': '#FFD6D0',
    'error-transparent': 'rgba(255, 59, 48, 0.25)',

    'drop-highlight': '#007AFF33'
};

const blockColors = {
    checkboxActiveBackground: '#007AFF',
    checkboxActiveBorder: '#0055D4'
};

export {
    guiColors,
    blockColors
};
