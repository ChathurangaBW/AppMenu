import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

const RECENT_ITEMS_FILE = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
const SEARCH_DEBOUNCE_MS = 200;
const MAX_RESULTS = 8;
const MAX_RESULTS_PER_SECTION = 4;

const SETTINGS_PANELS = [
    ['Wi-Fi', 'wifi'],
    ['Network', 'network'],
    ['Bluetooth', 'bluetooth'],
    ['Appearance', 'appearance'],
    ['Notifications', 'notifications'],
    ['Search', 'search'],
    ['Applications', 'applications'],
    ['Privacy & Security', 'privacy'],
    ['Online Accounts', 'online-accounts'],
    ['Sharing', 'sharing'],
    ['Sound', 'sound'],
    ['Power', 'power'],
    ['Displays', 'display'],
    ['Mouse & Touchpad', 'mouse'],
    ['Keyboard', 'keyboard'],
    ['Printers', 'printers'],
    ['Users', 'users'],
    ['Default Apps', 'default-apps'],
    ['Date & Time', 'datetime'],
    ['About', 'about'],
];

function _recentItems() {
    try {
        const file = Gio.File.new_for_path(RECENT_ITEMS_FILE);
        const [ok, bytes] = file.load_contents(null);
        if (!ok) return [];
        const xml = new TextDecoder().decode(bytes);
        const matches = [...xml.matchAll(/<bookmark href="([^"]+)"[\s\S]*?<title>([^<]*)<\/title>/g)];
        return matches.map(match => ({
            type: 'file',
            title: match[2] || decodeURIComponent(match[1].split('/').pop() || match[1]),
            subtitle: decodeURIComponent(match[1]),
            uri: match[1],
        })).slice(0, 80);
    } catch (_e) {
        return [];
    }
}

const SearchDialog = GObject.registerClass(
class SearchDialog extends ModalDialog.ModalDialog {
    constructor() {
        super({ styleClass: 'appmenu-search-dialog' });
        this._timeoutId = 0;
        this._appSystem = Shell.AppSystem.get_default();
        this._recentCache = null;
        this._resultButtons = [];
        this._selectedIndex = -1;
        this._clutterTextSignals = [];

        this._entry = new St.Entry({
            style_class: 'appmenu-search-entry',
            hint_text: 'Search apps, recent files, and settings',
            can_focus: true,
            track_hover: true,
        });
        this.contentLayout.add_child(this._entry);

        this._resultsBox = new St.BoxLayout({
            vertical: true,
            style_class: 'appmenu-search-results',
        });
        this.contentLayout.add_child(this._resultsBox);

        const clutterText = this._entry.clutter_text;
        this._clutterTextSignals.push(
            clutterText.connect('text-changed', () => this._scheduleSearch()));
        this._clutterTextSignals.push(
            clutterText.connect('key-press-event', (_actor, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Down) {
                this._moveSelection(1);
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Up) {
                this._moveSelection(-1);
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                const selected = this._resultButtons[this._selectedIndex] ?? this._resultButtons[0];
                selected?.activate?.();
                return Clutter.EVENT_STOP;
            }
                return Clutter.EVENT_PROPAGATE;
            }));
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        // Disconnect clutter text signals
        if (this._entry?.clutter_text && this._clutterTextSignals) {
            const ct = this._entry.clutter_text;
            this._clutterTextSignals.forEach(id => { try { ct.disconnect(id); } catch (_e) {} });
        }
        this._clutterTextSignals = null;
        // Destroy owned child actors
        if (this._resultsBox) {
            this._resultsBox.destroy_all_children();
            this._resultsBox = null;
        }
        if (this._entry) {
            this._entry.destroy();
            this._entry = null;
        }
        // Release owned references
        this._resultButtons = null;
        this._recentCache = null;
        this._appSystem = null;
        this._selectedIndex = -1;
        super.destroy();
    }

    open() {
        super.open(global.get_current_time());
        this._entry.set_text('');
        this._renderResults(this._defaultResults());
        this._entry.grab_key_focus();
    }

    toggle() {
        if (this.state === ModalDialog.State.OPENED || this.state === ModalDialog.State.OPENING)
            this.close(global.get_current_time());
        else
            this.open();
    }

    _scheduleSearch() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SEARCH_DEBOUNCE_MS, () => {
            this._timeoutId = 0;
            this._search(this._entry.get_text());
            return GLib.SOURCE_REMOVE;
        });
    }

    _defaultResults() {
        return [
            { type: 'settings', title: 'System Settings', subtitle: 'Open GNOME Settings', panel: '' },
            ...this._apps().slice(0, 4),
            ...this._recent().slice(0, 3),
        ];
    }

    _apps() {
        return this._appSystem.get_installed().map(app => ({
            type: 'app',
            title: app.get_name(),
            subtitle: app.get_description() || app.get_id(),
            app,
        })).filter(item => item.title);
    }

    _settings() {
        return SETTINGS_PANELS.map(([title, panel]) => ({
            type: 'settings',
            title,
            subtitle: `Open ${title} settings`,
            panel,
        }));
    }

    _recent() {
        if (!this._recentCache)
            this._recentCache = _recentItems();
        return this._recentCache;
    }

    _search(query) {
        const q = query.trim().toLowerCase();
        if (!q) {
            this._renderResults(this._defaultResults());
            return;
        }

        const sources = [...this._apps(), ...this._settings(), ...this._recent()];
        const results = sources
            .map(item => {
                const haystack = `${item.title} ${item.subtitle || ''}`.toLowerCase();
                let score = 99;
                if (haystack.startsWith(q))
                    score = 0;
                else if (haystack.includes(q))
                    score = 2;
                if (item.type === 'app')
                    score -= 0.5;
                else if (item.type === 'settings')
                    score += 0.25;
                return { item, score };
            })
            .filter(entry => entry.score < 99)
            .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title))
            .slice(0, MAX_RESULTS)
            .map(entry => entry.item);

        this._renderResults(results);
    }

    _groupResults(results) {
        const groups = [
            ['Applications', results.filter(item => item.type === 'app').slice(0, MAX_RESULTS_PER_SECTION)],
            ['Recent Files', results.filter(item => item.type === 'file').slice(0, MAX_RESULTS_PER_SECTION)],
            ['Settings', results.filter(item => item.type === 'settings').slice(0, MAX_RESULTS_PER_SECTION)],
        ];

        return groups.filter(([, items]) => items.length > 0);
    }

    _moveSelection(delta) {
        if (this._resultButtons.length === 0)
            return;
        const nextIndex = this._selectedIndex < 0
            ? 0
            : (this._selectedIndex + delta + this._resultButtons.length) % this._resultButtons.length;
        this._setSelectedIndex(nextIndex);
    }

    _setSelectedIndex(index) {
        this._selectedIndex = index;
        this._resultButtons.forEach((button, idx) => {
            if (idx === index) {
                button.add_style_pseudo_class('focus');
                button.grab_key_focus();
            } else {
                button.remove_style_pseudo_class('focus');
            }
        });
    }

    _renderResults(results) {
        this._resultsBox.destroy_all_children();
        this._resultButtons = [];
        this._selectedIndex = -1;
        if (results.length === 0) {
            this._resultsBox.add_child(new St.Label({
                text: 'No results',
                style_class: 'appmenu-search-empty',
            }));
            return;
        }

        for (const [sectionTitle, sectionItems] of this._groupResults(results)) {
            this._resultsBox.add_child(new St.Label({
                text: sectionTitle,
                style_class: 'appmenu-search-section-title',
                x_align: Clutter.ActorAlign.START,
            }));

            for (const item of sectionItems) {
                const button = new St.Button({
                    style_class: 'appmenu-search-result',
                    can_focus: true,
                    track_hover: true,
                });
                button.activate = () => this._activate(item);
                button.connect('clicked', () => this._activate(item));
                button.connect('notify::hover', () => {
                    if (button.hover) {
                        const idx = this._resultButtons.indexOf(button);
                        if (idx >= 0)
                            this._setSelectedIndex(idx);
                    }
                });

                const box = new St.BoxLayout({ vertical: true });
                box.add_child(new St.Label({
                    text: item.title,
                    style_class: 'appmenu-search-result-title',
                    x_align: Clutter.ActorAlign.START,
                }));
                box.add_child(new St.Label({
                    text: item.subtitle || item.type,
                    style_class: 'appmenu-search-result-subtitle',
                    x_align: Clutter.ActorAlign.START,
                }));
                button.add_child(box);
                this._resultButtons.push(button);
                this._resultsBox.add_child(button);
            }
        }

        this._setSelectedIndex(0);
    }

    _activate(item) {
        this.close(global.get_current_time());
        if (item.type === 'app') {
            item.app.open_new_window(-1);
        } else if (item.type === 'file') {
            Gio.AppInfo.launch_default_for_uri(item.uri, null);
        } else if (item.type === 'settings') {
            try {
                const argv = item.panel ? ['gnome-control-center', item.panel] : ['gnome-control-center'];
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            } catch (_e) {
                // Ignore missing Settings app or invalid panel names.
            }
        }
    }
});

let _dialog = null;

export function toggleSearchDialog() {
    if (!_dialog)
        _dialog = new SearchDialog();
    _dialog.toggle();
}

export function destroySearchDialog() {
    if (_dialog) {
        _dialog.destroy();
        _dialog = null;
    }
}
