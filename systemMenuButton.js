import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Logger from './logger.js';
import { _ } from './i18n.js';

function _spawn(argv) {
    try {
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
    } catch (e) {
        Logger.error(`Failed to spawn ${argv.join(' ')}: ${e}`);
    }
}

function _findCommand(preferred, fallbacks) {
    let candidates = [preferred, ...fallbacks].filter(Boolean);
    for (let cmd of candidates) {
        try {
            let [, argv] = GLib.shell_parse_argv(cmd);
            if (argv && argv[0] && GLib.find_program_in_path(argv[0]))
                return cmd;
        } catch (e) { /* skip malformed */ }
    }
    return null;
}

const TERMINAL_FALLBACKS = ['ptyxis', 'gnome-terminal', 'kgx', 'konsole', 'kitty', 'alacritty', 'tilix', 'terminator', 'xterm'];
const SOFTWARE_FALLBACKS = ['gnome-software', 'plasma-discover', 'pamac-manager', 'snap-store'];
const MONITOR_FALLBACKS = ['gnome-system-monitor', 'resources', 'ksysguard', 'xfce4-taskmanager'];

export const SystemMenuButton = GObject.registerClass(
class SystemMenuButton extends PanelMenu.Button {
    _init(settings, extensionPath) {
        super._init(0.5, _('System Menu'));

        this._settings = settings;
        this._extensionPath = extensionPath;

        this._icon = new St.Icon({
            style_class: 'appmenu-logo-icon system-status-icon',
        });
        this.add_child(this._icon);

        this._syncIcon();
        this._rebuildMenu();

        this._settingsChangedId = this._settings.connect('changed', (_s, key) => {
            if (['distro-icon-name', 'distro-icon-symbolic', 'custom-icon-path', 'icon-size'].includes(key)) {
                this._syncIcon();
            } else if (!['debug-logging', 'use-real-menus', 'search-shortcut', 'lock-to-focused-app',
                        'show-user-switcher', 'show-workspace-indicator', 'workspace-indicator-position',
                        'prefer-macos-style', 'app-blacklist'].includes(key)) {
                this._rebuildMenu();
            }
        });

        this.connect('destroy', () => this._onDestroy());
    }

    _syncIcon() {
        let size = this._settings.get_int('icon-size');
        if (size > 0) this._icon.icon_size = size;

        let customPath = this._settings.get_string('custom-icon-path');
        if (customPath) {
            let file = Gio.File.new_for_path(customPath);
            if (file.query_exists(null)) {
                this._icon.gicon = Gio.icon_new_for_string(customPath);
                return;
            }
        }

        let distroIcon = this._settings.get_string('distro-icon-name');
        if (distroIcon) {
            let variant = this._settings.get_boolean('distro-icon-symbolic') ? 'symbolic' : 'color';
            let bundledPath = GLib.build_filenamev([this._extensionPath, 'icons', `distro-${distroIcon}-${variant}.svg`]);
            let file = Gio.File.new_for_path(bundledPath);
            if (!file.query_exists(null)) {
                let otherVar = variant === 'symbolic' ? 'color' : 'symbolic';
                bundledPath = GLib.build_filenamev([this._extensionPath, 'icons', `distro-${distroIcon}-${otherVar}.svg`]);
                file = Gio.File.new_for_path(bundledPath);
            }
            if (file.query_exists(null)) {
                this._icon.gicon = Gio.icon_new_for_string(bundledPath);
                return;
            }
        }

        let iconName = this._settings.get_string('menu-icon') || 'start-here-symbolic';
        this._icon.icon_name = iconName;
    }

    _rebuildMenu() {
        this.menu.removeAll();

        this._addItem(_('About This System'), () => _spawn(['gnome-control-center', 'system', 'about']));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (this._settings.get_boolean('hide-overview-button'))
            this._addItem(_('Activities'), () => Main.overview.toggle());

        if (this._settings.get_boolean('show-app-grid'))
            this._addItem(_('App Grid'), () => { Main.overview.dash.showAppsButton.checked = true; Main.overview.show(); });

        if (this._settings.get_boolean('hide-overview-button') || this._settings.get_boolean('show-app-grid'))
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (this._settings.get_boolean('show-software-center'))
            this._addItem(_('Software Center'), () => this._launch('software-center-command', SOFTWARE_FALLBACKS, _('Software Center')));
        if (this._settings.get_boolean('show-system-monitor'))
            this._addItem(_('System Monitor'), () => this._launch('system-monitor-command', MONITOR_FALLBACKS, _('System Monitor')));
        if (this._settings.get_boolean('show-terminal'))
            this._addItem(_('Terminal'), () => this._launch('terminal-command', TERMINAL_FALLBACKS, _('Terminal')));
        if (this._settings.get_boolean('show-extensions-app'))
            this._addItem(_('Extensions'), () => this._openExtensions());

        if (this._settings.get_boolean('show-force-quit')) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addItem(_('Force Quit App'), () => this._forceQuit());
        }

        let customs = this._loadCustomItems();
        if (customs.length > 0) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            customs.forEach(item => this._addItem(item.label || _('(untitled)'), () => _spawn(item.value.split(' '))));
        }

        let hasPower = this._settings.get_boolean('show-power-options') ||
                       this._settings.get_boolean('show-lock-screen') ||
                       this._settings.get_boolean('show-log-out');

        if (hasPower) this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (this._settings.get_boolean('show-power-options')) {
            this._addItem(_('Sleep'), () => _spawn(['systemctl', 'suspend']));
            this._addItem(_('Restart…'), () => _spawn(['gnome-session-quit', '--reboot']));
            this._addItem(_('Shut Down…'), () => _spawn(['gnome-session-quit', '--power-off']));
        }
        if (this._settings.get_boolean('show-lock-screen'))
            this._addItem(_('Lock Screen'), () => _spawn(['loginctl', 'lock-session']));
        if (this._settings.get_boolean('show-log-out'))
            this._addItem(_('Log Out…'), () => _spawn(['gnome-session-quit', '--logout']));
    }

    _addItem(label, activateFn) {
        let item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', activateFn);
        this.menu.addMenuItem(item);
    }

    _launch(settingKey, fallbacks, label) {
        let configured = this._settings.get_string(settingKey);
        let resolved = _findCommand(configured, fallbacks);
        if (resolved) {
            try { let [, argv] = GLib.shell_parse_argv(resolved); _spawn(argv); } catch (e) {}
        } else {
            Main.notify(_('System Menu'), `${_('No')} ${label} ${_('application found. Set one in Preferences.')}`);
        }
    }

    _openExtensions() {
        let appSys = Shell.AppSystem.get_default();
        let prefId = this._settings.get_string('extensions-app-id') || 'org.gnome.Extensions.desktop';
        let app = appSys.lookup_app(prefId) ||
                  appSys.lookup_app('org.gnome.Extensions.desktop') ||
                  appSys.lookup_app('com.mattjakeman.ExtensionManager.desktop');
        if (app) {
            try { app.activate(); } catch (e) { _spawn(['gnome-extensions-app']); }
        } else {
            _spawn(['gnome-extensions-app']);
        }
    }

    _forceQuit() {
        let window = global.display.get_focus_window();
        if (!window) {
            Main.notify(_('Force Quit'), _('No focused window to quit.'));
            return;
        }
        try { window.kill(); } catch (e) { Logger.error(`Force Quit failed: ${e}`); }
    }

    _loadCustomItems() {
        try {
            let items = JSON.parse(this._settings.get_string('system-menu-custom-items') || '[]');
            return Array.isArray(items) ? items.filter(i => i && i.value) : [];
        } catch (e) { return []; }
    }

    _onDestroy() {
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
    }
});
