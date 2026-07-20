/*
 * userSwitcher.js - macOS-style Fast User Switching for AppMenu.
 * Displays user avatars in the right side of the panel with session switching.
 */

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Avatar as UserAvatar} from 'resource:///org/gnome/shell/ui/userWidget.js';

// Lazily import Gdm — it's only needed for session switching and may not exist
// on non-GDM display managers (LightDM, SDDM, console-only, etc.)
let _Gdm = null;
try {
    // `imports` is a GJS global for runtime GI imports (fails at runtime, not parse-time)
    _Gdm = imports.gi.Gdm;
} catch (_e) {
    // GDM typelib not available — extension still loads, just can't switch sessions
}

Gio._promisify(Gio.DBusProxy, 'new', 'new_finish');
Gio._promisify(Gio.DBusProxy.prototype, 'call');

const DEFAULT_BUTTON_ICON = 'system-users-symbolic';
const AVATAR_ICON_SIZE = 64;
const MINIMUM_VISIBLE_UID = 1000;

/**
 * Manages the UserSwitcherButton lifecycle — shows/hides based on user count.
 */
export class UserSwitcherController {
    constructor(extension, settings) {
        this._extension = extension;
        this._settings = settings;
        this._userSwitcher = null;
        this._userManager = null;
        this._signals = [];
        this._fallbackTimeoutId = 0;
        this._settingsChangedId = 0;

        this._initUserManager();

        // Listen for settings changes
        if (this._settings) {
            this._settingsChangedId = this._settings.connect('changed::show-user-switcher', () => {
                this._updateVisibility();
            });
        }
    }

    destroy() {
        this._disconnectSignals();

        if (this._fallbackTimeoutId) {
            GLib.source_remove(this._fallbackTimeoutId);
            this._fallbackTimeoutId = 0;
        }

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        if (this._userSwitcher) {
            this._userSwitcher.destroy();
            this._userSwitcher = null;
        }

        this._userManager = null;
        this._settings = null;
        this._extension = null;
    }

    _initUserManager() {
        this._userManager = AccountsService.UserManager.get_default();
        if (!this._userManager) {
            // UserManager unavailable — show based on setting alone after a brief delay
            this._fallbackTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                this._fallbackTimeoutId = 0;
                this._updateVisibility();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        this._signals = [
            this._userManager.connect('notify::is-loaded', () => this._updateVisibility()),
            this._userManager.connect('user-added', () => this._updateVisibility()),
            this._userManager.connect('user-removed', () => this._updateVisibility()),
        ];

        if (this._userManager.is_loaded) {
            this._updateVisibility();
        } else {
            this._userManager.list_users();
            // Fallback: if UserManager doesn't load within 3s, show based on setting
            this._fallbackTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                this._fallbackTimeoutId = 0;
                if (!this._userManager?.is_loaded) {
                    this._updateVisibility();
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _disconnectSignals() {
        if (!this._userManager) return;
        this._signals.filter(id => id > 0).forEach(id => {
            try { this._userManager.disconnect(id); } catch (_e) { /* ignore */ }
        });
        this._signals = [];
    }

    _updateVisibility() {
        const showSetting = this._settings
            ? this._settings.get_boolean('show-user-switcher')
            : true;

        const shouldShow = showSetting;

        if (shouldShow && !this._userSwitcher) {
            this._userSwitcher = new UserSwitcherButton(this._extension);
            Main.panel.addToStatusArea('AppMenuUserSwitcher', this._userSwitcher, 1, 'right');
        } else if (!shouldShow && this._userSwitcher) {
            this._userSwitcher.destroy();
            this._userSwitcher = null;
        }
    }
}

/**
 * Panel button that shows user avatars and allows fast user switching.
 */
export const UserSwitcherButton = GObject.registerClass(
    {GTypeName: 'AppMenuUserSwitcherButton'},
    class UserSwitcherButton extends PanelMenu.Button {
        _init(extension) {
            super._init(1.0, 'AppMenuUserSwitcher');

            this._extension = extension;
            this._menuSignals = [];
            this._userManager = null;
            this._loginManagerProxy = null;
            this._loginManagerProxyPromise = null;
            this._repaintFuncId = 0;
            this._cancellable = new Gio.Cancellable();
            this._isDestroyed = false;
            this._rebuilding = false;

            this._buttonIcon = new St.Icon({
                icon_name: DEFAULT_BUTTON_ICON,
                icon_size: 18,
                style_class: 'appmenu-user-switcher-button',
            });
            this.add_child(this._buttonIcon);

            this._usernameLabel = new St.Label({
                text: GLib.get_user_name(),
                style_class: 'panel-button-label',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._usernameLabel);

            if (this.menu?.actor) {
                this.menu.actor.add_style_class_name('appmenu-user-switcher-menu');
                this.menu.actor.set_x_align(Clutter.ActorAlign.END);
                this.menu.actor.set_x_expand(false);
                if (typeof this.menu.setSourceAlignment === 'function') {
                    this.menu.setSourceAlignment(1);
                }
            }

            this._menuOpenSignalId = this.menu?.connect('open-state-changed', (_, open) => {
                if (open) this._rebuildMenu().catch(logError);
            }) ?? 0;

            this._initUserManager();
        }

        destroy() {
            this._isDestroyed = true;

            if (this._cancellable) {
                this._cancellable.cancel();
                this._cancellable = null;
            }

            this._disconnectUserManagerSignals();

            if (this._menuOpenSignalId) {
                this.menu.disconnect(this._menuOpenSignalId);
                this._menuOpenSignalId = 0;
            }

            this._clearRepaintFunc();
            this._loginManagerProxy = null;
            this._loginManagerProxyPromise = null;
            this._userManager = null;
            this._usernameLabel = null;
            this._extension = null;

            super.destroy();
        }

        _initUserManager() {
            this._userManager = AccountsService.UserManager.get_default();
            if (!this._userManager) return;

            const rebuild = () => this._rebuildMenu().catch(logError);
            this._menuSignals = [
                this._userManager.connect('notify::is-loaded', rebuild),
                this._userManager.connect('user-added', rebuild),
                this._userManager.connect('user-removed', rebuild),
                this._userManager.connect('user-changed', rebuild),
                this._userManager.connect('user-is-logged-in-changed', rebuild),
            ];

            if (this._userManager.is_loaded) rebuild();
            else this._userManager.list_users();
        }

        _disconnectUserManagerSignals() {
            if (!this._userManager) return;
            this._menuSignals.filter(id => id > 0).forEach(id => {
                try { this._userManager.disconnect(id); } catch (_e) { /* ignore */ }
            });
            this._menuSignals = [];
        }

        async _rebuildMenu() {
            if (!this._userManager || !this.menu || !this._userManager.is_loaded) return;
            // Prevent concurrent rebuild storms from rapid user-changed signals
            if (this._rebuilding) return;
            this._rebuilding = true;

            try {
                this.menu.removeAll();

                const currentUserName = GLib.get_user_name();
                const users = this._collectVisibleUsers(currentUserName);
                const sessionInfo = await this._getSessionInfo();
                if (this._isDestroyed || !this.menu) return;

                if (users.length === 0) {
                    const placeholder = new PopupMenu.PopupMenuItem('No eligible user accounts found');
                    placeholder.setSensitive(false);
                    this.menu.addMenuItem(placeholder);
                } else {
                    const gridSection = new PopupMenu.PopupMenuSection();
                    const gridContainer = new St.BoxLayout({
                        vertical: true,
                        style_class: 'appmenu-user-grid',
                        x_expand: true,
                    });

                    let currentRow = null;
                    users.forEach((user, index) => {
                        if (index % 3 === 0) {
                            currentRow = new St.BoxLayout({vertical: false, x_expand: true});
                            gridContainer.add_child(currentRow);
                        }
                        const userWidget = this._createUserWidget(user, currentUserName, sessionInfo);
                        userWidget.set_x_expand(true);
                        currentRow.add_child(userWidget);
                    });

                    gridSection.actor.add_child(gridContainer);
                    this.menu.addMenuItem(gridSection);
                }

                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                this._addActionItem('Login Window...', () => this._gotoLoginWindow());
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                this._addActionItem('Users & Groups Preferences...', () => this._openUserSettings());

                this._updatePanelIcon(users, currentUserName);
            } finally {
                this._rebuilding = false;
            }
        }

        _clearRepaintFunc() {
            if (this._repaintFuncId) {
                Clutter.threads_remove_repaint_func(this._repaintFuncId);
                this._repaintFuncId = 0;
            }
        }

        async _ensureLoginManagerProxy() {
            if (this._loginManagerProxy) return this._loginManagerProxy;
            if (this._loginManagerProxyPromise) return this._loginManagerProxyPromise;

            this._loginManagerProxyPromise = (async () => {
                try {
                    const proxy = await Gio.DBusProxy.new(
                        Gio.DBus.system, Gio.DBusProxyFlags.NONE, null,
                        'org.freedesktop.login1', '/org/freedesktop/login1',
                        'org.freedesktop.login1.Manager', this._cancellable
                    );
                    if (this._isDestroyed) return null;
                    this._loginManagerProxy = proxy;
                    return proxy;
                } catch (error) {
                    if (!error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        logError(error, 'Failed to acquire login1 Manager proxy');
                    }
                    this._loginManagerProxy = null;
                    return null;
                } finally {
                    this._loginManagerProxyPromise = null;
                }
            })();

            return this._loginManagerProxyPromise;
        }

        async _getSessionProperty(sessionPath, propertyName) {
            if (typeof sessionPath !== 'string' || !sessionPath.startsWith('/org/freedesktop/login1/session/')) {
                return null;
            }
            try {
                const sessionProxy = await Gio.DBusProxy.new(
                    Gio.DBus.system, Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES, null,
                    'org.freedesktop.login1', sessionPath,
                    'org.freedesktop.login1.Session', this._cancellable
                );
                if (this._isDestroyed || !sessionProxy) return null;
                const variant = sessionProxy.get_cached_property(propertyName);
                return variant?.deepUnpack?.() ?? null;
            } catch (error) {
                if (error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) return null;
                logError(error, `Failed to read session ${propertyName}`);
                return null;
            }
        }

        async _getSessionInfo() {
            const loggedInUsers = new Set();
            const sessions = new Map();

            const proxy = await this._ensureLoginManagerProxy();
            if (!proxy || this._isDestroyed) return {loggedInUsers, sessions};

            try {
                const result = await proxy.call('ListSessions', null, Gio.DBusCallFlags.NONE, -1, this._cancellable);
                if (this._isDestroyed) return {loggedInUsers, sessions};

                const rawList = result?.deepUnpack?.() ?? [];
                const sessionList = (rawList.length === 1 && Array.isArray(rawList[0]) && Array.isArray(rawList[0][0]))
                    ? rawList[0] : rawList;

                for (const [sessionId, , userName, , sessionPath] of sessionList) {
                    if (!userName) continue;
                    loggedInUsers.add(userName);

                    const sessionPathStr = Array.isArray(sessionPath) ? sessionPath[0] : sessionPath;
                    if (typeof sessionPathStr !== 'string' || !sessionPathStr.startsWith('/org/freedesktop/login1/session/')) continue;

                    const sessionClass = await this._getSessionProperty(sessionPathStr, 'Class');
                    if (this._isDestroyed) return {loggedInUsers, sessions};
                    if (sessionClass !== 'user') continue;

                    const isActive = await this._getSessionProperty(sessionPathStr, 'Active');
                    if (this._isDestroyed) return {loggedInUsers, sessions};

                    const existing = sessions.get(userName);
                    if (!existing || (isActive === true && existing.isActive !== true)) {
                        sessions.set(userName, {sessionId, sessionClass, isActive: Boolean(isActive)});
                    }
                }
            } catch (error) {
                if (!error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    logError(error, 'Failed to get session info from login1 D-Bus');
                }
            }

            return {loggedInUsers, sessions};
        }

        _collectVisibleUsers(currentUserName) {
            const userList = this._userManager.list_users() ?? [];
            const filtered = userList.filter(user => {
                if (!user || !user.is_loaded) return false;
                const uid = Number.parseInt(user.get_uid?.() ?? '-1', 10);
                if (!Number.isFinite(uid)) return false;
                const username = user.get_user_name?.();
                if (!username) return false;
                if (username === currentUserName) return true;
                return uid >= MINIMUM_VISIBLE_UID && !user.system_account;
            });

            return filtered.sort((a, b) => this._compareUsers(a, b, currentUserName));
        }

        _compareUsers(a, b, currentUserName) {
            const aIsCurrent = a.get_user_name() === currentUserName;
            const bIsCurrent = b.get_user_name() === currentUserName;
            if (aIsCurrent && !bIsCurrent) return -1;
            if (!aIsCurrent && bIsCurrent) return 1;
            const aName = a.get_real_name?.() || a.get_user_name?.() || '';
            const bName = b.get_real_name?.() || b.get_user_name?.() || '';
            return GLib.utf8_collate(aName, bName);
        }

        _createUserWidget(user, currentUserName, sessionInfo) {
            const displayName = user.get_real_name?.() || user.get_user_name?.() || '';
            const username = user.get_user_name?.() || '';
            const isCurrent = username === currentUserName;
            const isSignedIn = sessionInfo.loggedInUsers.has(username);

            const button = new St.Button({
                style_class: 'appmenu-user-item',
                reactive: true,
                can_focus: true,
                x_expand: true,
                y_expand: true,
            });
            button.set_x_align(Clutter.ActorAlign.FILL);

            if (isCurrent) button.add_style_class_name('current-user');

            const content = new St.BoxLayout({
                vertical: true,
                style_class: 'appmenu-user-item-content',
                x_align: Clutter.ActorAlign.CENTER,
            });

            // Avatar container with badge overlay
            const avatarContainer = new St.Widget({
                style_class: 'appmenu-user-avatar-container',
                layout_manager: new Clutter.BinLayout(),
                x_expand: false,
                y_expand: false,
            });

            const avatarBin = new St.Bin({
                style_class: 'appmenu-user-card-avatar-frame',
                x_expand: true,
                y_expand: true,
            });
            avatarBin.clip_to_allocation = true;

            if (isCurrent) avatarBin.add_style_class_name('current-user');
            else if (isSignedIn) avatarBin.add_style_class_name('logged-in');

            const avatar = new UserAvatar(user, {
                styleClass: 'appmenu-user-card-avatar',
                iconSize: AVATAR_ICON_SIZE,
                reactive: false,
            });
            avatar.update();
            avatarBin.set_child(avatar);
            avatarContainer.add_child(avatarBin);

            // Session badge (checkmark) for current/logged-in users
            if (isCurrent || isSignedIn) {
                const sessionBadge = new St.Icon({
                    style_class: isCurrent
                        ? 'appmenu-user-session-badge current-user'
                        : 'appmenu-user-session-badge',
                    icon_name: 'object-select-symbolic',
                    icon_size: 14,
                    x_expand: true,
                    y_expand: true,
                    x_align: Clutter.ActorAlign.END,
                    y_align: Clutter.ActorAlign.END,
                });
                avatarContainer.add_child(sessionBadge);
            }

            content.add_child(avatarContainer);

            const nameLabel = new St.Label({
                text: displayName,
                style_class: 'appmenu-user-card-name',
                x_align: Clutter.ActorAlign.CENTER,
            });
            content.add_child(nameLabel);
            button.set_child(content);

            button.connect('clicked', () => this._activateUser(user).catch(logError));

            return button;
        }

        _addActionItem(label, callback) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => {
                this.menu.close(true);
                callback();
            });
            this.menu.addMenuItem(item);
        }

        async _activateUser(user) {
            if (!user) return;
            this.menu.close(true);

            const username = user.get_user_name?.();
            if (!username) return;

            const currentUserName = GLib.get_user_name();
            if (username === currentUserName) return;

            const activated = await this._activateUserSession(username);
            if (this._isDestroyed) return;

            if (!activated) this._gotoLoginWindow();
        }

        async _activateUserSession(username) {
            const {sessions} = await this._getSessionInfo();
            if (this._isDestroyed) return false;

            const sessionData = sessions.get(username);
            if (!sessionData) return false;

            const proxy = await this._ensureLoginManagerProxy();
            if (!proxy || this._isDestroyed) return false;

            try {
                await proxy.call(
                    'ActivateSession',
                    new GLib.Variant('(s)', [sessionData.sessionId]),
                    Gio.DBusCallFlags.NONE, -1, this._cancellable
                );
                return true;
            } catch (error) {
                if (error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) return false;
                logError(error, 'Failed to activate user session via login1 D-Bus');
                return false;
            }
        }

        _gotoLoginWindow() {
            if (Main.screenShield) Main.screenShield.lock(false);

            if (!_Gdm) {
                log('appmenu userSwitcher: GDM not available, cannot show login window');
                return;
            }

            this._clearRepaintFunc();
            this._repaintFuncId = Clutter.threads_add_repaint_func(Clutter.RepaintFlags.POST_PAINT, () => {
                this._repaintFuncId = 0;
                try {
                    _Gdm.goto_login_session_sync(null);
                } catch (error) {
                    logError(error, 'Failed to switch to GDM login session');
                }
                return false;
            });
        }

        _openUserSettings() {
            Util.spawn(['gnome-control-center', 'system', 'users']);
        }

        _updatePanelIcon(_users, _currentUserName) {
            this._buttonIcon.gicon = null;
            this._buttonIcon.icon_name = DEFAULT_BUTTON_ICON;
            this._usernameLabel.text = _currentUserName;
        }
    }
);
