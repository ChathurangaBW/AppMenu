import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { _ } from './i18n.js';

// Loaded at module import time — avoids sync IO in shell code (EGO-X-004)
let ICONS_DATA = [];
try {
    // Resolve icons.json relative to this module's location
    const url = import.meta.url;
    const [filePath] = GLib.filename_from_uri(url);
    const extDir = GLib.path_get_dirname(filePath);
    const iconPath = GLib.build_filenamev([extDir, 'icons.json']);
    const file = Gio.File.new_for_path(iconPath);
    const [ok, contents] = file.load_contents(null);
    if (ok) {
        const data = JSON.parse(new TextDecoder().decode(contents));
        ICONS_DATA = Array.isArray(data) ? data : [];
    }
} catch (_e) { /* icons.json unavailable — use empty list */ }

export default class AppMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.appmenu');

        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup();
        page.add(group);

        // Show OS icon
        const showOsIconRow = new Adw.SwitchRow({
            title: _('Show OS icon'),
            subtitle: _('Show the logo icon in the top panel.'),
        });
        settings.bind('show-os-icon', showOsIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showOsIconRow);

        // Icon selector
        const icons = ICONS_DATA;
        const iconTitles = new Gtk.StringList();
        icons.forEach(icon => iconTitles.append(icon.title));

        const deriveIconName = (path) => path.endsWith('.svg') ? path.slice(0, -4) : path;

        const iconRow = new Adw.ComboRow({
            title: _('Icon'),
            model: iconTitles,
        });

        const iconMap = {};
        icons.forEach((icon, idx) => {
            iconMap[deriveIconName(icon.path)] = idx;
        });

        const currentIcon = settings.get_string('menu-icon');
        iconRow.selected = (currentIcon && iconMap[currentIcon] !== undefined) ? iconMap[currentIcon] : 0;

        iconRow.connect('notify::selected', () => {
            const selected = icons[iconRow.selected];
            if (selected) {
                settings.set_string('menu-icon', deriveIconName(selected.path));
            }
        });

        settings.connect('changed::menu-icon', () => {
            const name = settings.get_string('menu-icon');
            iconRow.selected = (iconMap[name] !== undefined) ? iconMap[name] : 0;
        });

        group.add(iconRow);

        // Lock to focused app
        const lockRow = new Adw.SwitchRow({
            title: _('Lock to focused app'),
            subtitle: _('Only update menu when switching windows.'),
        });
        settings.bind('lock-to-focused-app', lockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(lockRow);

        // Show user switcher
        const showUserSwitcherRow = new Adw.SwitchRow({
            title: _('Show User Switcher'),
            subtitle: _('Show user switcher in the right side of the panel.'),
        });
        settings.bind('show-user-switcher', showUserSwitcherRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showUserSwitcherRow);

        // Show workspace indicator
        const showWorkspaceIndicatorRow = new Adw.SwitchRow({
            title: _('Show Workspace Indicator'),
            subtitle: _('Show workspace navigation dots in the top panel.'),
        });
        settings.bind('show-workspace-indicator', showWorkspaceIndicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showWorkspaceIndicatorRow);

        const realMenusRow = new Adw.SwitchRow({
            title: _('Use real application menus'),
            subtitle: _('Read exported D-Bus menus when apps provide them, and fall back automatically otherwise.'),
        });
        settings.bind('use-real-menus', realMenusRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(realMenusRow);

        // Debug logging
        const debugLoggingRow = new Adw.SwitchRow({
            title: _('Debug Logging'),
            subtitle: _('Write diagnostic AppMenu logs to the GNOME Shell journal.'),
        });
        settings.bind('debug-logging', debugLoggingRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(debugLoggingRow);

        // Icon size
        const iconSizeRow = new Adw.SpinRow({
            title: _('Icon Size'),
            subtitle: _('Panel icon size in pixels (12–36).'),
            value: settings.get_int('icon-size') || 22,
            adjustment: new Gtk.Adjustment({lower: 12, upper: 36, step_increment: 2}),
        });
        iconSizeRow.connect('notify::value', () => {
            settings.set_int('icon-size', iconSizeRow.get_value());
        });
        settings.connect('changed::icon-size', () => {
            iconSizeRow.set_value(settings.get_int('icon-size') || 22);
        });
        group.add(iconSizeRow);
    }
}
