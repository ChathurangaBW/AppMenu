import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
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

// Distro icon map — local symbolic SVG icons for panel-friendly display
const DISTRO_ICONS = {
    'debian':     'distributor-logo-debian',
    'ubuntu':     'distributor-logo-ubuntu',
    'fedora':     'distributor-logo-fedora',
    'arch':       'distributor-logo-archlinux',
    'manjaro':    'distributor-logo-manjaro',
    'opensuse':   'distributor-logo-opensuse',
    'centos':     'distributor-logo-fedora',
    'rhel':       'distributor-logo-fedora',
    'alpine':     'distributor-logo-alpine',
    'mint':       'distributor-logo-linux-mint',
    'pop':        'distributor-logo-pop-os',
    'elementary': 'distributor-logo-elementary',
    'garuda':     'distributor-logo-archlinux',
    'nixos':      'distributor-logo-nixos',
    'void':       'distributor-logo-void',
    'gentoo':     'distributor-logo-gentoo',
    'slackware':  'distributor-logo-archlinux',
    'solus':      'distributor-logo-fedora',
    'zorin':      'distributor-logo-zorin',
    'endeavour':  'distributor-logo-endeavouros',
    'nobara':     'distributor-logo-fedora',
    'kali':       'distributor-logo-kali-linux',
    'deepin':     'distributor-logo-debian',
    'devuan':     'distributor-logo-debian',
};

function detectDistroIcon() {
    try {
        const [ok, contents] = GLib.file_get_contents('/etc/os-release');
        if (!ok) return 'distributor-logo-debian';
        const text = new TextDecoder().decode(contents);
        const idMatch = text.match(/^ID=(.+)$/m);
        if (idMatch) {
            const id = idMatch[1].replace(/"/g, '').trim().toLowerCase();
            return DISTRO_ICONS[id] || 'distributor-logo-debian';
        }
    } catch (e) {
        // fallback
    }
    return 'distributor-logo-debian';
}

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

// Static menus — computed once, never change
const STATIC_MENUS = [
    { label: "File",   children: buildFileMenu() },
    { label: "Edit",   children: buildEditMenu() },
    { label: "View",   children: buildViewMenu() },
    { label: "Go",     children: buildGoMenu() },
    { label: "Help",   children: buildHelpMenu() },
];

const TopLevelMenuButton = GObject.registerClass(
  class TopLevelMenuButton extends PanelMenu.Button {
    _init(label, children, appInstance = null, menuManagerInstance = null) {
      super._init(0.0, label);
      this.add_style_class_name('appmenu-panel-button');
      this._appInstance = appInstance;
      this._menuManagerInstance = menuManagerInstance;
      this._isIcon = false;

      // Determine if label is an icon name (e.g. distributor-logo-ubuntu)
      if (label && (label.includes('distributor-logo') || label.includes('-logo'))) {
        this._isIcon = true;
        const icon = new St.Icon({
            icon_size: 18,
            style_class: 'system-status-icon',
        });
        this.add_child(icon);
        this._titleWidget = icon;
        this._setIcon(label);
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

      this._setMenuOpenHandler(null);
      this._buildSubMenu(children, this.menu);
    }

    _executeNativeAction(action, closeMenu = true) {
        // Close the menu first to return focus to the previous window
        if (closeMenu && this.menu) {
            this.menu.close(true);
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
            this._setIcon(label);
            return;
        }
        this._titleWidget.set_text(label);
    }

    _setIcon(label) {
        if (!this._titleWidget || !label) return;
        const iconFile = Gio.File.new_for_path(
            GLib.build_filenamev([EXTENSION_ICONS_DIR, `${label}.svg`]));
        if (iconFile.query_exists(null)) {
            try { this._titleWidget.set_gicon(Gio.FileIcon.new(iconFile)); } catch (_e) {}
        } else {
            this._titleWidget.icon_name = 'start-here-symbolic';
        }
    }

    _setMenuOpenHandler(handler) {
        this._menuOpenHandler = handler;
        if (this._menuOpenSignalId)
            this.menu.disconnect(this._menuOpenSignalId);

        this._menuOpenSignalId = this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this._menuOpenHandler?.();
        });
    }

    rebuildMenu(children, openHandler = null) {
        this.menu.removeAll();
        this._setMenuOpenHandler(openHandler);
        this._buildSubMenu(children, this.menu);
    }

    _buildSubMenu(menuItems, parentMenu) {
      for (const item of menuItems) {
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
              subMenu.menu.connect('open-state-changed', (_menu, isOpen) => {
                  if (isOpen)
                      item.onOpen();
              });
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
            menuItem.connect("activate", () => {
              item.activate();
            });
          } else if (item.action) {
            menuItem.connect("activate", () => {
              this._executeNativeAction(item.action, true);
            });
          }
          parentMenu.addMenuItem(menuItem);
        }
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
        this._distroIcon = detectDistroIcon();
        this._realMenuManager = new RealMenuManager(this._settings, () => {
            this.updateMenuForWindow(global.display.get_focus_window(), true);
        });

        // Cached settings values (updated via signals, not read per focus change)
        this._cachedMenuIcon = this._settings ? this._settings.get_string('menu-icon') : '';
        this._cachedShowOsIcon = this._settings ? this._settings.get_boolean('show-os-icon') : true;

        // Cached singletons (avoid repeated get_default() calls)
        this._windowTracker = Shell.WindowTracker.get_default();
        this._appSystem = Shell.AppSystem.get_default();

        // App menu cache — avoid rebuild when same app stays focused
        this._lastAppId = null;
        this._lastAppMenuData = null;
        this._lastWindowId = null;
        this._lastRealMenuKey = null;

        // Listen for settings changes
        if (this._settings) {
            this._settingsSignalIds = [
                this._settings.connect('changed::show-os-icon', () => {
                    this._cachedShowOsIcon = this._settings.get_boolean('show-os-icon');
                    this._updateOsIconVisibility();
                }),
                this._settings.connect('changed::menu-icon', () => {
                    this._cachedMenuIcon = this._settings.get_string('menu-icon');
                    // Invalidate app cache so slot 0 updates on next focus change
                    this._lastAppId = null;
                }),
                this._settings.connect('changed::use-real-menus', () => {
                    this._lastAppId = null;
                    this._lastWindowId = null;
                    this._lastRealMenuKey = null;
                    this._realMenuManager.invalidate();
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
            : this._distroIcon;
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

    updateMenuForWindow(window, force = false) {
        let appName = "Desktop";
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
        const appChildren = realMenuData?.appMenuChildren?.length
            ? realMenuData.appMenuChildren
            : fallbackAppChildren;

        const windowChildren = buildWindowMenu(window, detectedApp);
        const appleChildren = buildAppleMenu();

        let topLevelMenus = realMenuData?.topLevelMenus?.length
            ? realMenuData.topLevelMenus.slice()
            : STATIC_MENUS.slice(0, 4).concat([{ label: 'Window', children: windowChildren }], [STATIC_MENUS[4]]);

        if (realMenuData?.topLevelMenus?.length) {
            const hasWindowMenu = topLevelMenus.some(menu => menu.label.toLowerCase() === 'window');
            if (!hasWindowMenu)
                topLevelMenus.push({ label: 'Window', children: windowChildren });
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
        ];

        // Ensure we have exactly the required number of buttons
        while (this._buttons.length < newMenuData.length) {
            const idx = this._buttons.length;
            const data = newMenuData[idx];
            const btn = new TopLevelMenuButton(data.label, data.children, detectedApp, this);
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
