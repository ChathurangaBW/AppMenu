import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { _, initI18n } from './i18n.js';

// Loaded asynchronously to avoid synchronous file IO in shell code (EGO-X-004).
// The Icon selector renders an empty list until the load completes, then patches itself.
let ICONS_DATA = [];
let _iconsLoadStarted = false;

function _ensureIconsLoading() {
    if (_iconsLoadStarted)
        return;
    _iconsLoadStarted = true;
    let iconPath;
    try {
        const url = import.meta.url;
        const [filePath] = GLib.filename_from_uri(url);
        const extDir = GLib.path_get_dirname(filePath);
        iconPath = GLib.build_filenamev([extDir, 'icons.json']);
    } catch (_e) {
        iconPath = null;
    }
    if (!iconPath) {
        ICONS_DATA = [];
        return;
    }
    const file = Gio.File.new_for_path(iconPath);
    file.load_contents_async(null, (_src, res) => {
        try {
            const [ok, bytes] = file.load_contents_finish(res);
            if (ok) {
                const data = JSON.parse(new TextDecoder().decode(bytes));
                ICONS_DATA = Array.isArray(data) ? data : [];
            }
        } catch (_e) { /* icons.json unavailable — use empty list */ }
    });
}

export default class AppMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        initI18n(this);

        const settings = this.getSettings('org.gnome.shell.extensions.appmenu');

        const page = new Adw.PreferencesPage();
        window.add(page);

        const appearanceGroup = this._addGroup(
            page,
            _('Appearance'),
            _('Choose the panel icon and how AppMenu appears in the top bar.')
        );
        const behaviorGroup = this._addGroup(
            page,
            _('Menu Behavior'),
            _('Control when menus update and whether AppMenu should use real exported app menus.')
        );
        const panelGroup = this._addGroup(
            page,
            _('Panel Extras'),
            _('Configure optional panel items such as user switching and workspace navigation.')
        );
        const diagnosticsGroup = this._addGroup(
            page,
            _('Diagnostics'),
            _('Enable troubleshooting logs only when you need to collect debug information.')
        );

        // Show OS icon
        const showOsIconRow = new Adw.SwitchRow({
            title: _('Show OS icon'),
            subtitle: _('Show the logo icon in the top panel.'),
        });
        settings.bind('show-os-icon', showOsIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(showOsIconRow);

        // Icon selector — populated immediately from the array (which may be empty
        // until the async load completes); the post-load patch handler repopulates.
        _ensureIconsLoading();
        const iconTitles = new Gtk.StringList();
        ICONS_DATA.forEach(icon => iconTitles.append(icon.title));

        const deriveIconName = (path) => path.endsWith('.svg') ? path.slice(0, -4) : path;

        const iconRow = new Adw.ComboRow({
            title: _('Icon'),
            model: iconTitles,
        });

        const iconMap = {};
        const rebuildIconMap = () => {
            Object.keys(iconMap).forEach(k => delete iconMap[k]);
            ICONS_DATA.forEach((icon, idx) => {
                iconMap[deriveIconName(icon.path)] = idx;
            });
        };
        rebuildIconMap();

        const applyIconSelection = () => {
            const currentIcon = settings.get_string('menu-icon');
            iconRow.selected = (currentIcon && iconMap[currentIcon] !== undefined) ? iconMap[currentIcon] : 0;
        };
        applyIconSelection();

        // Patch the icon list once the async load completes (covers the common case
        // where the user opens preferences before icons.json has been read).
        // The poll is bounded — returns SOURCE_REMOVE once the data length changes.
        let _iconsPolling = true;
        let _iconsTimeoutId = 0;
        const _iconsLoadCheck = () => {
            if (!_iconsPolling)
                return GLib.SOURCE_REMOVE;
            // Detect a populated ICONS_DATA array by watching the length change.
            if (ICONS_DATA.length === iconTitles.get_n_items())
                return GLib.SOURCE_CONTINUE;
            iconTitles.splice(0, iconTitles.get_n_items());
            ICONS_DATA.forEach(icon => iconTitles.append(icon.title));
            rebuildIconMap();
            applyIconSelection();
            _iconsPolling = false;
            _iconsTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        };
        _iconsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, _iconsLoadCheck);

        // Stop the poll if the window is destroyed before the load completes.
        window.connect('destroy', () => {
            _iconsPolling = false;
            if (_iconsTimeoutId) {
                GLib.source_remove(_iconsTimeoutId);
                _iconsTimeoutId = 0;
            }
        });

        iconRow.connect('notify::selected', () => {
            const selected = ICONS_DATA[iconRow.selected];
            if (selected) {
                settings.set_string('menu-icon', deriveIconName(selected.path));
            }
        });

        settings.connect('changed::menu-icon', () => {
            const name = settings.get_string('menu-icon');
            iconRow.selected = (iconMap[name] !== undefined) ? iconMap[name] : 0;
        });

        appearanceGroup.add(iconRow);

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
        appearanceGroup.add(iconSizeRow);

        // Lock to focused app
        const lockRow = new Adw.SwitchRow({
            title: _('Lock to focused app'),
            subtitle: _('Only update menu when switching windows.'),
        });
        settings.bind('lock-to-focused-app', lockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(lockRow);

        const realMenusRow = new Adw.SwitchRow({
            title: _('Use real application menus'),
            subtitle: _('Read exported D-Bus menus when apps provide them. Apps without exported menus keep the safe fallback menus.'),
        });
        settings.bind('use-real-menus', realMenusRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(realMenusRow);

        // Show user switcher
        const showUserSwitcherRow = new Adw.SwitchRow({
            title: _('Show User Switcher'),
            subtitle: _('Show user switcher in the right side of the panel.'),
        });
        settings.bind('show-user-switcher', showUserSwitcherRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(showUserSwitcherRow);

        // Show workspace indicator
        const showWorkspaceIndicatorRow = new Adw.SwitchRow({
            title: _('Show Workspace Indicator'),
            subtitle: _('Show workspace navigation dots in the top panel.'),
        });
        settings.bind('show-workspace-indicator', showWorkspaceIndicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(showWorkspaceIndicatorRow);

        const workspacePositionModel = new Gtk.StringList();
        [_('Left side'), _('Right side')].forEach(label => workspacePositionModel.append(label));

        const workspacePositionRow = new Adw.ComboRow({
            title: _('Workspace Indicator Position'),
            subtitle: _('Choose which side of the panel shows workspace navigation.'),
            model: workspacePositionModel,
        });
        const workspacePositionValues = ['left', 'right'];
        const selectWorkspacePosition = () => {
            const current = settings.get_string('workspace-indicator-position');
            const index = workspacePositionValues.indexOf(current);
            workspacePositionRow.selected = index >= 0 ? index : 1;
        };
        selectWorkspacePosition();
        workspacePositionRow.connect('notify::selected', () => {
            const value = workspacePositionValues[workspacePositionRow.selected] ?? 'right';
            if (settings.get_string('workspace-indicator-position') !== value)
                settings.set_string('workspace-indicator-position', value);
        });
        settings.connect('changed::workspace-indicator-position', selectWorkspacePosition);
        settings.bind('show-workspace-indicator', workspacePositionRow, 'sensitive', Gio.SettingsBindFlags.GET);
        panelGroup.add(workspacePositionRow);

        // Debug logging
        const debugLoggingRow = new Adw.SwitchRow({
            title: _('Debug Logging'),
            subtitle: _('Write diagnostic AppMenu logs to the GNOME Shell journal.'),
        });
        settings.bind('debug-logging', debugLoggingRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        diagnosticsGroup.add(debugLoggingRow);

        diagnosticsGroup.add(this._buildResetRow(settings));
    }

    _addGroup(page, title, description) {
        const group = new Adw.PreferencesGroup({title, description});
        page.add(group);
        return group;
    }

    _buildResetRow(settings) {
        const resetRow = new Adw.ActionRow({
            title: _('Reset AppMenu Settings'),
            subtitle: _('Restore AppMenu preferences to their packaged defaults.'),
        });
        const resetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.add_css_class('destructive-action');
        resetButton.connect('clicked', () => {
            [
                'show-os-icon',
                'menu-icon',
                'icon-size',
                'lock-to-focused-app',
                'use-real-menus',
                'show-user-switcher',
                'show-workspace-indicator',
                'workspace-indicator-position',
                'debug-logging',
            ].forEach(key => settings.reset(key));
        });
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;
        return resetRow;
    }
}
