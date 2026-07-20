import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

function loadIconsMetadata(sourcePath) {
  const filePath = GLib.build_filenamev([sourcePath, 'icons.json']);
  try {
    const file = Gio.File.new_for_path(filePath);
    const [, contents] = file.load_contents(null);
    const data = JSON.parse(new TextDecoder().decode(contents));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default class AppMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.appmenu');

        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup();
        page.add(group);

        // Show OS icon
        const showOsIconRow = new Adw.SwitchRow({
            title: 'Show OS icon',
            subtitle: 'Show the logo icon in the top panel.',
        });
        settings.bind('show-os-icon', showOsIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showOsIconRow);

        // Icon selector
        const icons = loadIconsMetadata(this.path);
        const iconTitles = new Gtk.StringList();
        icons.forEach(icon => iconTitles.append(icon.title));

        const deriveIconName = (path) => path.endsWith('.svg') ? path.slice(0, -4) : path;

        const iconRow = new Adw.ComboRow({
            title: 'Icon',
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
            title: 'Lock to focused app',
            subtitle: 'Only update menu when switching windows.',
        });
        settings.bind('lock-to-focused-app', lockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(lockRow);

        // Show user switcher
        const showUserSwitcherRow = new Adw.SwitchRow({
            title: 'Show User Switcher',
            subtitle: 'Show user switcher in the right side of the panel.',
        });
        settings.bind('show-user-switcher', showUserSwitcherRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showUserSwitcherRow);

        // Show workspace indicator
        const showWorkspaceIndicatorRow = new Adw.SwitchRow({
            title: 'Show Workspace Indicator',
            subtitle: 'Show macOS-style workspace dots in the top panel.',
        });
        settings.bind('show-workspace-indicator', showWorkspaceIndicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showWorkspaceIndicatorRow);

        // Debug logging
        const debugLoggingRow = new Adw.SwitchRow({
            title: 'Debug Logging',
            subtitle: 'Write diagnostic AppMenu logs to the GNOME Shell journal.',
        });
        settings.bind('debug-logging', debugLoggingRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(debugLoggingRow);
    }
}
