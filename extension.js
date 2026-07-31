import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { MenuManager } from './menuManager.js';
import { UserSwitcherController } from './userSwitcher.js';
import { setLoggerSettings, debug } from './logger.js';
import { disposeViewActions } from './actions/viewActions.js';
import { WorkspaceIndicatorController } from './workspaceIndicator.js';
import { toggleSearchDialog, destroySearchDialog } from './searchDialog.js';
import { SystemMenuButton } from './systemMenuButton.js';
import { initI18n } from './i18n.js';

const FOCUS_DEBOUNCE_MS = 50;

export default class AppMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
        this._settings = null;
        this._focusTimeoutId = 0;
        this._focusedWindow = null;
        this._userSwitcherController = null;
        this._workspaceIndicatorController = null;
        this._searchShortcutInstalled = false;
        this._systemMenuButton = null;
        this._overviewHidden = false;
    }

    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.appmenu');
        initI18n(this);
        setLoggerSettings(this._settings);
        debug('Enabling extension.');

        this._focusedWindow = null;

        const uuid = this.metadata.uuid || 'appmenu@ChathurangaBW.github.io';
        this._menuManager = new MenuManager(uuid, this._settings);

        const initialWindow = global.display.get_focus_window();
        this._updateMenu(initialWindow);

        global.display.connectObject('notify::focus-window', () => {
            this._scheduleMenuUpdate();
        }, this);

        this._syncSystemMenu();
        this._syncOverviewButton();

        this._settingsChangedId = this._settings.connect('changed', (_s, key) => {
            if (key === 'show-os-icon') {
                this._syncSystemMenu();
            } else if (key === 'hide-overview-button') {
                this._syncOverviewButton();
            }
        });

        this._userSwitcherController = new UserSwitcherController(this, this._settings);
        this._workspaceIndicatorController = new WorkspaceIndicatorController(this._settings);
        this._addSearchKeybinding();
    }

    _syncSystemMenu() {
        let shouldShow = this._settings.get_boolean('show-os-icon');
        if (shouldShow && !this._systemMenuButton) {
            this._systemMenuButton = new SystemMenuButton(this._settings, this.path);
            Main.panel.addToStatusArea('appmenu-system', this._systemMenuButton, 0, 'left');
        } else if (!shouldShow && this._systemMenuButton) {
            this._systemMenuButton.destroy();
            this._systemMenuButton = null;
        }
    }

    _syncOverviewButton() {
        let activities = Main.panel.statusArea['activities'];
        if (!activities) return;
        let shouldHide = this._settings.get_boolean('hide-overview-button');
        if (shouldHide && !this._overviewHidden) {
            activities.hide();
            this._overviewHidden = true;
        } else if (!shouldHide && this._overviewHidden) {
            activities.show();
            this._overviewHidden = false;
        }
    }

    _addSearchKeybinding() {
        if (!this._settings || this._searchShortcutInstalled)
            return;

        Main.wm.addKeybinding(
            'search-shortcut',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            () => toggleSearchDialog()
        );
        this._searchShortcutInstalled = true;
    }

    _removeSearchKeybinding() {
        if (!this._searchShortcutInstalled)
            return;

        Main.wm.removeKeybinding('search-shortcut');
        this._searchShortcutInstalled = false;
    }

    _updateMenu(window) {
        if (!this._menuManager) return;

        const lockEnabled = this._settings
            ? this._settings.get_boolean('lock-to-focused-app')
            : true;

        if (lockEnabled) {
            if (window === this._focusedWindow)
                return;
            if (window === null)
                return;
            this._focusedWindow = window;
        } else {
            this._focusedWindow = window;
        }

        this._menuManager.updateMenuForWindow(window);
    }

    _scheduleMenuUpdate() {
        if (this._focusTimeoutId)
            GLib.source_remove(this._focusTimeoutId);

        this._focusTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FOCUS_DEBOUNCE_MS,
            () => {
                this._focusTimeoutId = 0;
                const activeWindow = global.display.get_focus_window();
                this._updateMenu(activeWindow);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    disable() {
        debug('Disabling extension.');

        global.display.disconnectObject(this);
        this._removeSearchKeybinding();
        destroySearchDialog();

        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
            this._focusTimeoutId = 0;
        }

        this._focusedWindow = null;

        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }

        if (this._userSwitcherController) {
            this._userSwitcherController.destroy();
            this._userSwitcherController = null;
        }

        if (this._workspaceIndicatorController) {
            this._workspaceIndicatorController.destroy();
            this._workspaceIndicatorController = null;
        }

        if (this._systemMenuButton) {
            this._systemMenuButton.destroy();
            this._systemMenuButton = null;
        }

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._overviewHidden) {
            let activities = Main.panel.statusArea['activities'];
            if (activities) activities.show();
            this._overviewHidden = false;
        }

        disposeViewActions();
        setLoggerSettings(null);
        this._settings = null;
    }
}
