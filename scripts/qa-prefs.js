import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

if (!GLib.get_home_dir().startsWith('/tmp/opencode/appmenu-qa/'))
    throw new Error('Use an isolated QA home.');
Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
const path = `${GLib.get_user_data_dir()}/gnome-shell/extensions/appmenu@ChathurangaBW.github.io`;
const {default: Prefs} = await import(`file://${path}/prefs.js`);
const [, bytes] = Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null);
const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), path, dir: Gio.File.new_for_path(path)};
Adw.init();
const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
function children(widget) {
    const result = [widget];
    for (let w = widget.get_first_child(); w; w = w.get_next_sibling()) result.push(...children(w));
    return result;
}
const results = [];
async function test(name, fn) {
    printerr(`QA: ${name}`);
    try { await fn(); results.push({name, pass: true}); }
    catch (e) { results.push({name, pass: false, error: `${e}`}); }
}
function assert(v, msg = 'Assertion failed') { if (!v) throw new Error(msg); }
async function run() {
    const prefs = new Prefs(metadata);
    const settings = prefs.getSettings('org.gnome.shell.extensions.appmenu');
    const saved = new Map(settings.list_keys().map(k => [k, settings.get_user_value(k)]));
    const window = new Adw.PreferencesWindow();
    try {
        await test('Preferences window builds and presents', () => {
            prefs.fillPreferencesWindow(window);
            printerr('QA: preferences constructed');
            window.present();
            printerr('QA: preferences presented');
        });
        await delay(500);
        const widgets = children(window);
        await test('Appearance icon gallery loads SVGs', () => {
            const flow = widgets.find(w => w instanceof Gtk.FlowBox);
            assert(flow && children(flow).filter(w => w instanceof Gtk.FlowBoxChild).length > 10);
        });
        await test('All six switch bindings work in both directions', () => {
            const keys = ['show-os-icon', 'lock-to-focused-app', 'use-real-menus', 'show-user-switcher',
                'show-workspace-indicator', 'debug-logging'];
            const rows = widgets.filter(w => w instanceof Adw.SwitchRow);
            assert(rows.length === keys.length);
            rows.forEach((row, i) => {
                settings.set_boolean(keys[i], false);
                assert(!row.active);
                row.active = true;
                assert(settings.get_boolean(keys[i]));
            });
        });
        await test('Icon size spin control persists', () => {
            const spin = widgets.find(w => w instanceof Adw.SpinRow);
            spin.set_value(28);
            assert(settings.get_int('icon-size') === 28);
        });
        await test('Workspace position control persists', () => {
            const combo = widgets.find(w => w instanceof Adw.ComboRow);
            combo.selected = 0;
            assert(settings.get_string('workspace-indicator-position') === 'left');
            combo.selected = 1;
            assert(settings.get_string('workspace-indicator-position') === 'right');
        });
        await test('Icon gallery selection persists', () => {
            const flow = widgets.find(w => w instanceof Gtk.FlowBox);
            const child = flow.get_child_at_index(1);
            flow.emit('child-activated', child);
            assert(settings.get_string('menu-icon') === child._iconName);
        });
        await test('Reset restores preferences defaults', () => {
            const reset = widgets.find(w => w instanceof Gtk.Button && w.get_label() === 'Reset');
            reset.emit('clicked');
            assert(settings.get_value('icon-size').equal(settings.get_default_value('icon-size')));
            assert(settings.get_value('menu-icon').equal(settings.get_default_value('menu-icon')));
        });
        const capture = (key, modifiers) => {
            const dialog = prefs._captureSearchShortcut(settings, window);
            const controllers = dialog.observe_controllers();
            for (let i = 0; i < controllers.get_n_items(); i++) {
                const controller = controllers.get_item(i);
                if (controller instanceof Gtk.EventControllerKey) {
                    controller.emit('key-pressed', key, 0, modifiers);
                    return dialog;
                }
            }
            throw new Error('Shortcut controller not found');
        };
        await test('Search shortcut: capture and persist new combination', () => {
            capture(Gdk.KEY_space, Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK);
            assert(settings.get_strv('search-shortcut')[0] === '<Control><Alt>space');
        });
        await test('Search shortcut: cancel preserves binding; typing keys rejected', () => {
            const before = settings.get_strv('search-shortcut')[0];
            capture(Gdk.KEY_Escape, 0);
            assert(settings.get_strv('search-shortcut')[0] === before);
            const dialog = capture(Gdk.KEY_a, 0);
            assert(settings.get_strv('search-shortcut')[0] === before);
            dialog.destroy();
        });
        await test('Search shortcut: Backspace disables', () => {
            capture(Gdk.KEY_BackSpace, 0);
            assert(settings.get_strv('search-shortcut').length === 0);
        });
        await test('Search shortcut: row disable and reset buttons', () => {
            const row = widgets.find(w => w instanceof Adw.ActionRow && w.title === 'Search shortcut');
            const controls = children(row).filter(w => w instanceof Gtk.Button);
            controls.find(w => w.tooltip_text === 'Reset shortcut').emit('clicked');
            assert(settings.get_value('search-shortcut').equal(settings.get_default_value('search-shortcut')));
            controls.find(w => w.label === 'Disable').emit('clicked');
            assert(settings.get_strv('search-shortcut').length === 0);
            widgets.find(w => w instanceof Gtk.Button && w.get_label() === 'Reset').emit('clicked');
            assert(settings.get_value('search-shortcut').equal(settings.get_default_value('search-shortcut')));
        });
    } finally {
        window.destroy();
        for (const [key, value] of saved) {
            if (value) settings.set_value(key, value); else settings.reset(key);
        }
    }
    await test('Immediate close while gallery loads', () => {
        const second = new Adw.PreferencesWindow();
        prefs.fillPreferencesWindow(second);
        second.destroy();
    });
    await delay(150);
    print(JSON.stringify({passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results}, null, 2));
}
await run();
System.exit(results.some(r => !r.pass) || results.length === 0 ? 1 : 0);
