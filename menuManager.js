import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { dispatch } from './actions/dispatcher.js';
import { buildAppMenu, buildFallbackAppMenu } from './menus/appMenu.js';
import { buildAppleMenu } from './menus/appleMenu.js';
import { buildFileMenu } from './menus/fileMenu.js';
import { buildEditMenu } from './menus/editMenu.js';
import { buildViewMenu } from './menus/viewMenu.js';
import { buildGoMenu } from './menus/goMenu.js';
import { buildWindowMenu } from './menus/windowMenu.js';
import { buildHelpMenu } from './menus/helpMenu.js';
import { RecentItemsSubmenu } from './recentItemsSubmenu.js';
import { RealMenuManager } from './realMenuManager.js';
import * as Logger from './logger.js';

// Default panel icon — `start-here-symbolic` adapts to every distro's icon theme
const DEFAULT_ICON = 'start-here-symbolic';

// Computed once at module load — avoids recomputing per button init
const EXTENSION_ICONS_DIR = (() => {
    // Resolve icons/ relative to this extension's directory
    try {
        const url = import.meta.url;
        if (url.startsWith('file://')) {
            const [filePath] = GLib.filename_from_uri(url);
            const extensionDir = GLib.path_get_dirname(filePath);
            return GLib.build_filenamev([extensionDir, 'icons']);
        }
    } catch (e) {
        // fallback
    }
    // Fallback: assume standard install location
    return GLib.build_filenamev([
        GLib.get_home_dir(),
        '.local', 'share', 'gnome-shell', 'extensions',
        'appmenu@ChathurangaBW.github.io', 'icons'
    ]);
})();

import { _ } from './i18n.js';

// Lazy-built for i18n — rebuilt on every request so translations apply
function _getStaticMenus() {
    return [
        { label: _("File"),   children: buildFileMenu() },
        { label: _("Edit"),   children: buildEditMenu() },
        { label: _("View"),   children: buildViewMenu() },
        { label: _("Go"),     children: buildGoMenu() },
        { label: _("Help"),   children: buildHelpMenu() },
    ];
}

const TopLevelMenuButton = GObject.registerClass(
  class TopLevelMenuButton extends PanelMenu.Button {
    _init(label, children, appInstance = null, menuManagerInstance = null) {
      super._init(0.0, label);
      this.add_style_class_name('appmenu-panel-button');
      this._appInstance = appInstance;
      this._menuManagerInstance = menuManagerInstance;
      this._isIcon = false;

      // Determine if label is an icon name (e.g. distributor-logo-ubuntu)
       if (label && (label.includes('distributor-logo') || label.includes('-logo') || label === DEFAULT_ICON)) {
        this._isIcon = true;
        this._iconSize = this._menuManagerInstance?._cachedIconSize ?? 22;
        this._titleWidget = new St.Icon({
            icon_size: this._iconSize,
            style_class: 'system-status-icon',
        });
        this.add_child(this._titleWidget);
        this._loadIcon(label);
      } else {
        let title = new St.Label({
            text: label,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'panel-button-label'
        });
        this.add_child(title);
        this._titleWidget = title;
      }
      this._menuOpenSignalId = 0;
      this._menuOpenHandler = null;
      this._subMenuSignalIds = [];
      this._destroyed = false;

      this._setMenuOpenHandler(null);
      this._buildSubMenu(children, this.menu);
    }

    _executeNativeAction(action, closeMenu = true) {
        // Close the menu first to return focus to the previous window
        if (closeMenu && this.menu) {
            this.menu.close(true);
        }

        // --- v5.4: custom menu actions ---
        if (action.startsWith('spawn-command:')) {
            let cmd = action.slice('spawn-command:'.length);
            try {
                let [, argv] = GLib.shell_parse_argv(cmd);
                GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
            } catch (e) {
                Logger.error(`Failed to spawn custom command '${cmd}': ${e}`);
            }
            return;
        }
        if (action.startsWith('custom-shortcut:')) {
            let accel = action.slice('custom-shortcut:'.length);
            this._sendAccelerator(accel);
            return;
        }

        // Give a brief moment for focus to return to Nautilus
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            if (this._menuManagerInstance)
                this._menuManagerInstance._timeoutIds = this._menuManagerInstance._timeoutIds.filter(id => id !== timeoutId);
            const ctx = {
                window: global.display.get_focus_window(),
                app: this._appInstance,
            };
            dispatch(action, ctx, this._menuManagerInstance);
            return GLib.SOURCE_REMOVE;
        });

        if (this._menuManagerInstance) {
            this._menuManagerInstance._timeoutIds.push(timeoutId);
        }
    }

    updateLabel(label) {
        if (this._isIcon) {
            this._loadIcon(label);
            return;
        }
        this._titleWidget.set_text(label);
    }

    _loadIcon(label) {
        if (!this._titleWidget || !label) return;

        if (label === DEFAULT_ICON) {
            this._titleWidget.set_gicon(null);
            this._titleWidget.set_icon_name(label);
            this._titleWidget.set_icon_size(this._menuManagerInstance?._cachedIconSize ?? 22);
            return;
        }

        const iconFile = Gio.File.new_for_path(
            GLib.build_filenamev([EXTENSION_ICONS_DIR, `${label}.svg`]));
        if (iconFile.query_exists(null)) {
            this._titleWidget.set_icon_name(null);
            this._titleWidget.set_gicon(Gio.FileIcon.new(iconFile));
            this._titleWidget.set_icon_size(this._menuManagerInstance?._cachedIconSize ?? 22);
        } else {
            this._titleWidget.set_gicon(null);
            this._titleWidget.set_icon_name(label);
            this._titleWidget.set_icon_size(this._menuManagerInstance?._cachedIconSize ?? 22);
        }
    }

    _setMenuOpenHandler(handler) {
        if (this._destroyed || !this.menu)
            return;
        this._menuOpenHandler = handler;
        if (this._menuOpenSignalId) {
            try { this.menu.disconnect(this._menuOpenSignalId); } catch (_e) {}
            this._menuOpenSignalId = 0;
        }

        this._menuOpenSignalId = this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen && !this._destroyed)
                this._menuOpenHandler?.();
        });
    }

    _disconnectMenuSignals() {
        if (this._menuOpenSignalId && this.menu) {
            try { this.menu.disconnect(this._menuOpenSignalId); } catch (_e) {}
            this._menuOpenSignalId = 0;
        }

        this._subMenuSignalIds.forEach(({target, id}) => {
            try { target.disconnect(id); } catch (_e) {}
        });
        this._subMenuSignalIds = [];
    }

    rebuildMenu(children, openHandler = null) {
        if (this._destroyed || !this.menu)
            return;

        this._disconnectMenuSignals();

        try {
            this.menu.removeAll();
        } catch (_e) { /* menu may already be disposed during rapid rebuilds */ }
        this._setMenuOpenHandler(openHandler);
        this._buildSubMenu(children, this.menu);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._menuOpenHandler = null;
        this._disconnectMenuSignals();
        try { this.menu?.close(true); } catch (_e) {}
        super.destroy();
    }

        _buildSubMenu(menuItems, parentMenu) {
      for (let idx = 0; idx < menuItems.length; idx++) {
        const item = menuItems[idx];
        if (item.type === "separator") {
          parentMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        } else if (item.type === "section-header") {
          let headerItem = new PopupMenu.PopupMenuItem(item.label, { activate: false });
          headerItem.setSensitive(false);
          headerItem.label.add_style_class_name('popup-subtitle-menu-item');
          parentMenu.addMenuItem(headerItem);
        } else if (item.type === "submenu") {
          const subMenu = new PopupMenu.PopupSubMenuMenuItem(item.label);
          if (typeof item.onOpen === 'function') {
              const sid = subMenu.menu.connect('open-state-changed', (_menu, isOpen) => {
                  if (isOpen)
                      item.onOpen();
              });
              this._subMenuSignalIds.push({ target: subMenu.menu, id: sid });
          }
          this._buildSubMenu(item.children, subMenu.menu);
          parentMenu.addMenuItem(subMenu);
        } else if (item.type === "recent-submenu") {
          const recentMenuManager = this._menuManagerInstance?._recentMenuManager ?? null;
          const recentSubmenu = new RecentItemsSubmenu(item.label, parentMenu, recentMenuManager);
          parentMenu.addMenuItem(recentSubmenu);
        } else {
          const menuItem = new PopupMenu.PopupMenuItem(item.label);
          if (item.sensitive === false)
            menuItem.setSensitive(false);
          if (item.ornament) {
            const ornament = item.ornament === 'dot'
              ? PopupMenu.Ornament.DOT
              : item.ornament === 'check'
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE;
            menuItem.setOrnament(ornament);
          }
          if (typeof item.activate === 'function') {
            const aid = menuItem.connect("activate", () => { item.activate(); });
            this._subMenuSignalIds.push({ target: menuItem, id: aid });
          } else if (item.action) {
            const aid = menuItem.connect("activate", () => { this._executeNativeAction(item.action, true); });
            this._subMenuSignalIds.push({ target: menuItem, id: aid });
          }
          parentMenu.addMenuItem(menuItem);
        }
      }
        }

    // v5.4: send custom keyboard shortcuts from user-defined menus
    _sendAccelerator(accel) {
        try {
            let [success, keyval, mods] = Clutter.accelerator_parse(accel);
            if (!success) {
                Logger.error(`Could not parse shortcut '${accel}'`);
                return;
            }
            let seat = Clutter.get_default_backend().get_default_seat();
            let vd = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            if (!vd) return;

            let modKeys = [];
            if (mods & Clutter.ModifierType.CONTROL_MASK) modKeys.push(Clutter.KEY_Control_L);
            if (mods & Clutter.ModifierType.SHIFT_MASK) modKeys.push(Clutter.KEY_Shift_L);
            if (mods & Clutter.ModifierType.MOD1_MASK) modKeys.push(Clutter.KEY_Alt_L);
            if (mods & Clutter.ModifierType.SUPER_MASK) modKeys.push(Clutter.KEY_Super_L);

            let t = GLib.get_monotonic_time();
            modKeys.forEach(k => {
                vd.notify_keyval(t, k, Clutter.KeyState.PRESSED);
                t += 5;
            });
            vd.notify_keyval(t, keyval, Clutter.KeyState.PRESSED);
            t += 5;
            vd.notify_keyval(t, keyval, Clutter.KeyState.RELEASED);
            t += 5;
            modKeys.slice().reverse().forEach(k => {
                vd.notify_keyval(t, k, Clutter.KeyState.RELEASED);
                t += 5;
            });
        } catch (e) {
            Logger.error(`Failed to send accelerator '${accel}': ${e}`);
        }
    }
  }
);

export class MenuManager {
    constructor(uuid, settings) {
        this.uuid = uuid;
        this._settings = settings;
        this._buttons = [];
        this._timeoutIds = [];
        this._recentMenuManager = new PopupMenu.PopupMenuManager(this);

        // Virtual keyboard device — created once, reused across all actions
        this._virtualDevice = null;

        // Pre-allocated blacklist cache
        this._cachedBlacklistKey = null;
        this._cachedBlacklistLower = null;
        this._cachedBlacklistSet = null;

        // Auto-detected distro icon (computed once, used as fallback)
        this._distroIcon = DEFAULT_ICON;
        this._realMenuManager = new RealMenuManager(this._settings, () => {
            this.updateMenuForWindow(global.display.get_focus_window(), true);
        });

        // Cached settings values (updated via signals, not read per focus change)
        this._cachedMenuIcon = this._settings ? this._settings.get_string('menu-icon') : '';
        this._cachedShowOsIcon = this._settings ? this._settings.get_boolean('show-os-icon') : true;
        this._cachedIconSize = this._settings ? Math.max(12, Math.min(36, this._settings.get_int('icon-size') || 22)) : 22;

        // Cached singletons (avoid repeated get_default() calls)
        this._windowTracker = Shell.WindowTracker.get_default();
        this._appSystem = Shell.AppSystem.get_default();

            // App menu cache — avoid rebuild when same app stays focused
            this._lastAppId = null;
            this._lastAppMenuData = null;
            this._lastWindowId = null;
            this._lastRealMenuKey = null;
            this._lastDiagnostics = null;

        // Listen for settings changes
        if (this._settings) {
            this._settingsSignalIds = [
                this._settings.connect('changed::show-os-icon', () => {
                    this._cachedShowOsIcon = this._settings.get_boolean('show-os-icon');
                    this._updateOsIconVisibility();
                }),
                this._settings.connect('changed::menu-icon', () => {
                    this._cachedMenuIcon = this._settings.get_string('menu-icon');
                    // Rebuild immediately so preferences do not require a focus change.
                    this._lastAppId = null;
                    this._lastWindowId = null;
                    this._lastRealMenuKey = null;
                    this.updateMenuForWindow(global.display.get_focus_window(), true);
                }),
                this._settings.connect('changed::use-real-menus', () => {
                    this._lastAppId = null;
                    this._lastWindowId = null;
                    this._lastRealMenuKey = null;
                    this._realMenuManager.invalidate();
                    this.updateMenuForWindow(global.display.get_focus_window(), true);
                }),
                this._settings.connect('changed::icon-size', () => {
                    this._cachedIconSize = Math.max(12, Math.min(36, this._settings.get_int('icon-size') || 22));
                    this._lastAppId = null;
                    this._lastWindowId = null;
                    if (this._buttons.length > 0) {
                        const btn0 = this._buttons[0];
                        if (btn0._isIcon && btn0._titleWidget) {
                            btn0._titleWidget.set_icon_size(this._cachedIconSize);
                        }
                    }
                    this.updateMenuForWindow(global.display.get_focus_window(), true);
                }),
            ];
        } else {
            this._settingsSignalIds = [];
        }
    }

    get _menuIcon() {
        return (this._cachedMenuIcon && this._cachedMenuIcon.length > 0)
            ? this._cachedMenuIcon
            : DEFAULT_ICON;
    }

    get _showOsIcon() {
        return this._cachedShowOsIcon;
    }

    _updateOsIconVisibility() {
        if (this._buttons.length === 0) return;
        const osIconBtn = this._buttons[0];
        osIconBtn.visible = this._showOsIcon;
    }

    get _blacklist() {
        if (!this._settings) return [];
        const raw = this._settings.get_strv('app-blacklist');
        // Invalidate cache only when values actually changed (get_strv returns new array each call)
        const key = raw.join('\0');
        if (key !== this._cachedBlacklistKey) {
            this._cachedBlacklistKey = key;
            this._cachedBlacklistLower = raw.map(s => s.toLowerCase());
            this._cachedBlacklistSet = new Set(this._cachedBlacklistLower);
        }
        return this._cachedBlacklistLower;
    }

        getVirtualDevice() {
        if (!this._virtualDevice) {
            try {
                const seat = Clutter.get_default_backend().get_default_seat();
                this._virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            } catch (e) {
                Logger.error(`Failed to create virtual device: ${e}`);
            }
        }
        return this._virtualDevice;
        }

        _settingBool(key, fallback = false) {
            try {
                return this._settings?.get_boolean(key) ?? fallback;
            } catch (_e) {
                return fallback;
            }
        }

        _buildTroubleshootingInfo() {
            const info = this._lastDiagnostics ?? {};
            const lines = [
                'AppMenu troubleshooting info',
                `UUID: ${this.uuid}`,
                `Extension metadata version: 7`,
                `GNOME Shell: ${Config.PACKAGE_VERSION ?? 'unknown'}`,
                `Session: ${GLib.getenv('XDG_SESSION_TYPE') || 'unknown'}`,
                `Focused app: ${info.appName ?? _('Desktop')}`,
                `Application ID: ${info.appId ?? 'none'}`,
                `Window class: ${info.wmClass || 'none'}`,
                `Window title present: ${info.hasWindowTitle ? 'yes' : 'no'}`,
                `Real menus setting: ${this._settingBool('use-real-menus', true) ? 'enabled' : 'disabled'}`,
                `Menu source: ${info.menuSource ?? 'fallback'}`,
                `Debug logging: ${this._settingBool('debug-logging', false) ? 'enabled' : 'disabled'}`,
                `User switcher: ${this._settingBool('show-user-switcher', true) ? 'enabled' : 'disabled'}`,
                `Workspace indicator: ${this._settingBool('show-workspace-indicator', false) ? 'enabled' : 'disabled'}`,
                'Install note: on Wayland, log out and log back in after installing or upgrading.',
            ];
            return lines.join('\n');
        }

        _copyTroubleshootingInfo() {
            const text = this._buildTroubleshootingInfo();
            try {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
                Main.notify(_('AppMenu'), _('Troubleshooting info copied to clipboard.'));
                Logger.debug('Troubleshooting info copied to clipboard.');
            } catch (e) {
                Logger.error(`Failed to copy troubleshooting info: ${e}`);
                Main.notify(_('AppMenu'), _('Could not copy troubleshooting info. Enable debug logging and check the journal.'));
            }
        }

        _buildStatusMenuChildren() {
            const info = this._lastDiagnostics ?? {};
            const menuSource = info.menuSource ?? _('Fallback menus');
            const focusedApp = info.appName ?? _('Desktop');
            const realMenusEnabled = this._settingBool('use-real-menus', true);

            return [
                { type: 'section-header', label: _('Current Status') },
                { label: _('Extension: Active'), sensitive: false },
                { label: _('Focused app: %s').replace('%s', focusedApp), sensitive: false },
                { label: _('Menu source: %s').replace('%s', menuSource), sensitive: false },
                { label: _('Real menus: %s').replace('%s', realMenusEnabled ? _('Enabled') : _('Disabled')), sensitive: false },
                { type: 'separator' },
                { label: _('Copy Troubleshooting Info'), activate: () => this._copyTroubleshootingInfo() },
                { label: _('Open AppMenu Preferences'), action: 'open-settings-ext' },
            ];
        }

        updateMenuForWindow(window, force = false) {
        let appName = _("Desktop");
        let isAppFocused = false;
        let detectedApp = null;

        if (window) {
            let windowType = window.get_window_type();

            if (windowType === 0) {
                detectedApp = this._windowTracker.get_window_app(window);

                // Fast-path: skip blacklist entirely if list is empty
                const blacklistLower = this._blacklist;
                const blacklistSet = this._cachedBlacklistSet;
                if (blacklistLower.length > 0) {
                    const idLower = detectedApp ? (detectedApp.get_id() || "").toLowerCase() : "";
                    const nameLower = detectedApp ? (detectedApp.get_name() || "").toLowerCase() : "";
                    const wmClassLower = (window.get_wm_class() || "").toLowerCase();
                    const titleLower = (window.get_title() || "").toLowerCase();

                    // O(1) exact match first, then O(n) substring fallback
                    const isBlacklisted = blacklistSet.has(idLower) ||
                        blacklistSet.has(nameLower) ||
                        blacklistSet.has(wmClassLower) ||
                        blacklistSet.has(titleLower) ||
                        blacklistLower.some(item =>
                            idLower.includes(item) ||
                            nameLower.includes(item) ||
                            wmClassLower.includes(item) ||
                            titleLower.includes(item)
                        );

                    if (isBlacklisted) {
                        detectedApp = null;
                    }
                }

                if (detectedApp) {
                    appName = detectedApp.get_name();
                    isAppFocused = true;
                } else if (window.get_wm_class()) {
                    const wmClass = window.get_wm_class();
                    let fallbackApp = this._appSystem.lookup_desktop_wmclass(wmClass);
                    if (!fallbackApp) {
                        fallbackApp = this._appSystem.lookup_desktop_wmclass(wmClass.toLowerCase());
                    }
                    if (fallbackApp) {
                        detectedApp = fallbackApp;
                        appName = fallbackApp.get_name();
                    } else {
                        appName = wmClass.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    }
                    isAppFocused = true;
                }
            }
        }

        const currentAppId = detectedApp ? detectedApp.get_id() : null;
        const currentWindowId = window?.get_id?.() ?? null;
        const wmClass = window?.get_wm_class?.() ?? '';
            const realMenuData = this._realMenuManager.updateForWindow(window, appName, detectedApp, wmClass);
            const realMenuKey = realMenuData?.registrationKey ?? null;
            const menuSource = realMenuData?.topLevelMenus?.length
                ? _('Real exported menus')
                : _('Fallback menus');
            this._lastDiagnostics = {
                appName,
                appId: detectedApp?.get_id?.() ?? null,
                wmClass,
                hasWindowTitle: Boolean(window?.get_title?.()),
                menuSource,
            };

        // Skip rebuild if the effective menu state is unchanged
        if (!force
            && currentAppId === this._lastAppId
            && currentWindowId === this._lastWindowId
            && realMenuKey === this._lastRealMenuKey
            && this._lastAppMenuData) {
            if (this._buttons.length > 0) {
                this._buttons[0].visible = this._showOsIcon;
            }
            return;
        }

        const fallbackAppChildren = isAppFocused
            ? buildAppMenu(appName, detectedApp, window)
            : buildFallbackAppMenu();

        // --- v5.4: window list + Quit / App Details ---
        let augmentedAppChildren = fallbackAppChildren.slice();
        if (isAppFocused && detectedApp) {
            let openWindows = detectedApp.get_windows();
            if (openWindows && openWindows.length > 1) {
                let winItems = [];
                winItems.push({ type: 'section-header', label: _('Open Windows') });
                openWindows.forEach(w => {
                    let t = w.get_title() || appName;
                    winItems.push({
                        label: w === window ? `✓ ${t}` : t,
                        activate: () => {
                            try { w.activate(global.get_current_time()); } catch (e) {}
                        }
                    });
                });
                winItems.push({ type: 'separator' });
                augmentedAppChildren = [...winItems, ...augmentedAppChildren];
            }

            // App Details and Quit at the bottom
            augmentedAppChildren.push({ type: 'separator' });
            augmentedAppChildren.push({
                label: _('App Details'),
                activate: () => {
                    try {
                        GLib.spawn_async(null,
                            ['gnome-software', `--details=${detectedApp.get_id()}`],
                            null, GLib.SpawnFlags.SEARCH_PATH, null);
                    } catch (e) {}
                }
            });
            augmentedAppChildren.push({
                label: _('Quit %s').replace('%s', appName),
                activate: () => {
                    try {
                        let wins = detectedApp.get_windows();
                        if (wins && wins.length > 0)
                            wins.forEach(w => w.delete(global.get_current_time()));
                    } catch (e) {}
                }
            });
        }

        const appChildren = realMenuData?.appMenuChildren?.length
            ? realMenuData.appMenuChildren
            : augmentedAppChildren;

        // --- Custom app menus ---
        let customMenus = [];
        try {
            let raw = this._settings.get_string('custom-app-menus') || '[]';
            let sections = JSON.parse(raw);
            if (Array.isArray(sections)) {
                sections = sections.filter(s => s && s.enabled !== false);
                sections.forEach(section => {
                    let items = Array.isArray(section.items) ? section.items : [];
                    let children = items.filter(e => e && e.value).map(e => ({
                        label: e.label || _('(untitled)'),
                        action: e.kind === 'shortcut'
                            ? `custom-shortcut:${e.value}`
                            : `spawn-command:${e.value}`,
                    }));
                    if (children.length === 0)
                        children.push({ label: _('No items configured'), sensitive: false });
                    customMenus.push({
                        type: 'submenu',
                        label: section.label || _('Custom'),
                        children,
                    });
                });
            }
        } catch (e) { /* ignore parse errors */ }

        const windowChildren = buildWindowMenu(window, detectedApp);
            const appleChildren = buildAppleMenu(this._buildStatusMenuChildren());

        let topLevelMenus = realMenuData?.topLevelMenus?.length
            ? realMenuData.topLevelMenus.slice()
            : _getStaticMenus().slice(0, 4).concat([{ label: _('Window'), children: windowChildren }], [_getStaticMenus()[4]]);

        if (realMenuData?.topLevelMenus?.length) {
            const hasWindowMenu = topLevelMenus.some(menu => menu.label.toLowerCase() === 'window');
            if (!hasWindowMenu)
                topLevelMenus.push({ label: _('Window'), children: windowChildren });
        }

        // Cache app menu data
        this._lastAppId = currentAppId;
        this._lastAppMenuData = appChildren;
        this._lastWindowId = currentWindowId;
        this._lastRealMenuKey = realMenuKey;

        const newMenuData = [
            { label: this._menuIcon, children: appleChildren },
            { label: appName, children: appChildren },
            ...topLevelMenus,
            ...customMenus,
        ];

        // Ensure we have exactly the required number of buttons
        while (this._buttons.length < newMenuData.length) {
            const idx = this._buttons.length;
            const data = newMenuData[idx];
            // Start empty; the update loop below builds each menu exactly once.
            // Passing data.children here would build in the constructor and then
            // immediately remove/rebuild, which causes disposed PopupMenuItem
            // warnings during extension reloads.
            const btn = new TopLevelMenuButton(data.label, [], detectedApp, this);
            Main.panel.addToStatusArea(`${this.uuid}-${idx}`, btn, idx + 1, 'left');
            this._buttons.push(btn);
        }

        for (let i = 0; i < newMenuData.length; i++) {
            const btn = this._buttons[i];
            const data = newMenuData[i];

            btn._appInstance = detectedApp;
            btn.updateLabel(data.label);
            btn.rebuildMenu(data.children, data.onOpen ?? null);
        }

        // Destroy excess buttons (shouldn't happen, but defensive)
        while (this._buttons.length > newMenuData.length) {
            const extra = this._buttons.pop();
            extra.destroy();
        }

        // Update OS icon visibility
        if (this._buttons.length > 0) {
            this._buttons[0].visible = this._showOsIcon;
        }
    }

    clear() {
        this._buttons.forEach(btn => btn.destroy());
        this._buttons = [];

        // Safely cancel any active timeout loops to eliminate leaks/lint findings
        if (this._timeoutIds && this._timeoutIds.length > 0) {
            this._timeoutIds.forEach(id => GLib.source_remove(id));
            this._timeoutIds = [];
        }
    }

    destroy() {
        // Disconnect settings signals to prevent memory leaks
        if (this._settings && this._settingsSignalIds) {
            this._settingsSignalIds.forEach(id => {
                try { this._settings.disconnect(id); } catch (_e) { /* ignore */ }
            });
            this._settingsSignalIds = [];
        }
        this.clear();
        this._virtualDevice = null;
        this._realMenuManager?.destroy();
        this._realMenuManager = null;
    }
}
