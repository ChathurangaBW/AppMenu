import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { _, initI18n } from './i18n.js';

// Loaded asynchronously to avoid synchronous file IO in shell code (EGO-X-004).
// The Icon selector renders an empty list until the load completes, then patches itself.
let ICONS_DATA = [];
let _iconsLoadStarted = false;
let _iconsLoadFinished = false;

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
        _iconsLoadFinished = true;
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
        _iconsLoadFinished = true;
    });
}

export default class AppMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        initI18n(this);

        const prefsCss = new Gtk.CssProvider();
        try {
            prefsCss.load_from_path(GLib.build_filenamev([this.path, 'prefs.css']));
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                prefsCss,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
            );
            window.connect('destroy', () => {
                Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(), prefsCss);
            });
        } catch (_e) {}

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

        // Visual icon gallery — populated asynchronously from icons.json.
        _ensureIconsLoading();
        const deriveIconName = (path) => path.endsWith('.svg') ? path.slice(0, -4) : path;
        let iconsDir = null;
        try {
            const [prefsPath] = GLib.filename_from_uri(import.meta.url);
            iconsDir = GLib.build_filenamev([GLib.path_get_dirname(prefsPath), 'icons']);
        } catch (_e) {}
        const iconSearch = new Gtk.SearchEntry({
            placeholder_text: _('Search icons'),
            hexpand: true,
        });

        const iconGallery = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            homogeneous: true,
            row_spacing: 8,
            column_spacing: 8,
            min_children_per_line: 3,
            max_children_per_line: 7,
            activate_on_single_click: true,
        });
        iconGallery.add_css_class('appmenu-icon-gallery');
        const iconCards = [];

        const updateGallerySelection = () => {
            const current = settings.get_string('menu-icon')
                || deriveIconName(ICONS_DATA[0]?.path || '');
            iconCards.forEach(card => {
                if (card._iconName === current)
                    card.add_css_class('appmenu-icon-card-selected');
                else
                    card.remove_css_class('appmenu-icon-card-selected');
            });
        };

        const populateIconGallery = () => {
            let child = iconGallery.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                iconGallery.remove(child);
                child = next;
            }
            iconCards.length = 0;

            ICONS_DATA.forEach(icon => {
                const iconName = deriveIconName(icon.path);
                const card = new Gtk.FlowBoxChild({
                    tooltip_text: icon.title,
                });
                card._iconName = iconName;
                card._searchText = `${icon.title} ${iconName}`.toLowerCase();
                card.add_css_class('appmenu-icon-card');

                const box = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    spacing: 5,
                    margin_top: 8,
                    margin_bottom: 8,
                    margin_start: 6,
                    margin_end: 6,
                    halign: Gtk.Align.CENTER,
                });
                const iconFile = iconsDir
                    ? Gio.File.new_for_path(GLib.build_filenamev([iconsDir, icon.path]))
                    : null;
                const image = iconFile?.query_exists(null)
                    ? new Gtk.Image({gicon: Gio.FileIcon.new(iconFile), pixel_size: 38})
                    : new Gtk.Image({icon_name: iconName, pixel_size: 38});
                image.add_css_class('appmenu-icon-card-image');
                box.append(image);
                box.append(new Gtk.Label({
                    label: icon.title,
                    ellipsize: 3,
                    max_width_chars: 14,
                }));
                card.set_child(box);
                iconGallery.append(card);
                iconCards.push(card);
            });

            updateGallerySelection();
        };

        iconGallery.set_filter_func(child => {
            const query = iconSearch.get_text().trim().toLowerCase();
            return !query || child._searchText?.includes(query);
        });
        iconSearch.connect('search-changed', () => iconGallery.invalidate_filter());
        iconGallery.connect('child-activated', (_gallery, child) => {
            if (child?._iconName)
                settings.set_string('menu-icon', child._iconName);
        });
        const settingsSignalIds = [settings.connect('changed::menu-icon', updateGallerySelection)];

        const iconGalleryScroll = new Gtk.ScrolledWindow({
            min_content_height: 250,
            max_content_height: 380,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            child: iconGallery,
        });
        iconGalleryScroll.add_css_class('appmenu-icon-gallery-scroll');
        appearanceGroup.add(new Adw.ActionRow({
            title: _('Icon'),
            subtitle: _('Choose an icon from the visual gallery below.'),
        }));
        appearanceGroup.add(iconSearch);
        appearanceGroup.add(iconGalleryScroll);
        populateIconGallery();

        // Patch the icon list once the async load completes (covers the common case
        // where the user opens preferences before icons.json has been read).
        // The poll is bounded — returns SOURCE_REMOVE once the data length changes.
        let _iconsPolling = true;
        let _iconsTimeoutId = 0;
        const _iconsLoadCheck = () => {
            if (!_iconsPolling)
                return GLib.SOURCE_REMOVE;
            if (!_iconsLoadFinished)
                return GLib.SOURCE_CONTINUE;

            populateIconGallery();
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

        // Icon size
        const iconSizeRow = new Adw.SpinRow({
            title: _('Icon Size'),
            subtitle: _('Panel icon size in pixels (12–36).'),
            adjustment: new Gtk.Adjustment({lower: 12, upper: 36, step_increment: 2}),
        });
        iconSizeRow.set_value(Math.max(12, Math.min(36, settings.get_int('icon-size') || 22)));
        iconSizeRow.connect('notify::value', () => {
            settings.set_int('icon-size', Math.round(iconSizeRow.get_value()));
        });
        settingsSignalIds.push(settings.connect('changed::icon-size', () => {
            iconSizeRow.set_value(settings.get_int('icon-size') || 22);
        }));
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
        settingsSignalIds.push(settings.connect('changed::workspace-indicator-position', selectWorkspacePosition));
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

        window.connect('destroy', () => {
            settingsSignalIds.forEach(id => {
                try { settings.disconnect(id); } catch (_e) {}
            });
        });
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
