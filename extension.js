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
import { initI18n } from './i18n.js';

const FOCUS_DEBOUNCE_MS = 50;

export default class AppMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
        this._settings = null;
        this._focusTimeoutId = 0;
        this._focusedWindow = null;
        this._hasMenuFocusState = false;
        this._userSwitcherController = null;
        this._workspaceIndicatorController = null;
        this._searchShortcutInstalled = false;
        this._overviewHidden = false;
        this._overviewWasVisible = false;
    }

    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.appmenu');
        initI18n(this);
        setLoggerSettings(this._settings);
        debug('Enabling extension.');

        this._focusedWindow = null;
        this._hasMenuFocusState = false;

        const uuid = this.metadata.uuid || 'appmenu@ChathurangaBW.github.io';
        this._removeStalePanelButtons(uuid);
        this._menuManager = new MenuManager(uuid, this._settings);

        const initialWindow = global.display.get_focus_window();
        this._updateMenu(initialWindow);

        global.display.connectObject('notify::focus-window', () => {
            this._scheduleMenuUpdate();
        }, this);

        this._syncOverviewButton();

        this._settingsChangedId = this._settings.connect('changed', (_s, key) => {
            if (key === 'hide-overview-button') {
                this._syncOverviewButton();
            }
        });

        this._userSwitcherController = new UserSwitcherController(this, this._settings);
        this._workspaceIndicatorController = new WorkspaceIndicatorController(this._settings);
        this._addSearchKeybinding();
    }

    _removeStalePanelButtons(uuid) {
        const statusArea = Main.panel?.statusArea;
        if (!statusArea) return;

        for (const name of Object.keys(statusArea)) {
            if (!name.startsWith(`${uuid}-`))
                continue;

            try {
                statusArea[name]?.destroy();
            } catch (e) {
                debug(`Could not remove stale panel button ${name}: ${e}`);
            }
        }
    }

    _syncOverviewButton() {
        let activities = Main.panel.statusArea['activities'];
        if (!activities) return;
        let shouldHide = this._settings.get_boolean('hide-overview-button');
        if (shouldHide && !this._overviewHidden) {
            this._overviewWasVisible = activities.visible;
            activities.hide();
            this._overviewHidden = true;
        } else if (!shouldHide && this._overviewHidden) {
            if (this._overviewWasVisible)
                activities.show();
            this._overviewHidden = false;
            this._overviewWasVisible = false;
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

        if (lockEnabled && this._hasMenuFocusState && window === this._focusedWindow)
            return;

        // Mutter can report no focused window during Wayland focus transitions.
        // Reflect that state as Desktop instead of leaving the previous app menu stale.
        this._focusedWindow = window;
        this._hasMenuFocusState = true;
        debug(`Updating menu for ${window?.get_title?.() || 'Desktop'}.`);
        this._menuManager.updateMenuForWindow(window, true);
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
        this._hasMenuFocusState = false;

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

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._overviewHidden && this._overviewWasVisible) {
            let activities = Main.panel.statusArea['activities'];
            if (activities) activities.show();
        }
        this._overviewHidden = false;
        this._overviewWasVisible = false;

        disposeViewActions();
        setLoggerSettings(null);
        this._settings = null;
    }
}
