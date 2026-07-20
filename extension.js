import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import { MenuManager } from './menuManager.js';
import { UserSwitcherController } from './userSwitcher.js';

const FOCUS_DEBOUNCE_MS = 50;

export default class AppMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._menuManager = null;
        this._settings = null;
        this._focusTimeoutId = 0;
        this._focusedWindow = null;
        this._userSwitcherController = null;
    }

    enable() {
        console.log(`[appmenu@ChathurangaBW] Enabling extension.`);

        this._settings = this.getSettings('org.gnome.shell.extensions.appmenu');
        this._focusedWindow = null;

        const uuid = this.metadata.uuid || 'appmenu@ChathurangaBW';
        this._menuManager = new MenuManager(uuid, this._settings);

        let initialWindow = global.display.get_focus_window();
        this._updateMenu(initialWindow);

        global.display.connectObject('notify::focus-window', () => {
            this._scheduleMenuUpdate();
        }, this);

        // User switcher (right side of panel)
        this._userSwitcherController = new UserSwitcherController(this, this._settings);
    }

    _updateMenu(window) {
        if (!this._menuManager) return;

        const lockEnabled = this._settings
            ? this._settings.get_boolean('lock-to-focused-app')
            : true;

        if (lockEnabled) {
            // Only update if the focused window actually changed
            if (window === this._focusedWindow) {
                return;
            }
            // If window is null (e.g., hovering over panel), keep previous menu
            if (window === null) {
                return;
            }
            this._focusedWindow = window;
        } else {
            this._focusedWindow = window;
        }

        this._menuManager.updateMenuForWindow(window);
    }

    _scheduleMenuUpdate() {
        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
        }
        this._focusTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FOCUS_DEBOUNCE_MS,
            () => {
                this._focusTimeoutId = 0;
                let activeWindow = global.display.get_focus_window();
                this._updateMenu(activeWindow);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    disable() {
        console.log(`[appmenu@ChathurangaBW] Disabling extension.`);

        global.display.disconnectObject(this);

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

        if (this._settings) {
            this._settings = null;
        }
    }
}
