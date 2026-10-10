// GTK fixture for isolated GNOME integration tests.
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

if (!GLib.get_home_dir().startsWith('/tmp/opencode/appmenu-qa/'))
    throw new Error('Use an isolated QA home.');
const app = new Gtk.Application({application_id: 'org.example.AppMenuQA'});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({application: app, title: 'AppMenu QA fixture', default_width: 600, default_height: 400});
    const text = new Gtk.TextView();
    window.set_child(text);
    const state = new Gio.SimpleAction({name: 'text', parameter_type: new GLib.VariantType('s'), state: new GLib.Variant('s', '')});
    state.connect('activate', (_a, value) => text.buffer.set_text(value.get_string()[0], -1));
    text.buffer.connect('changed', () => {
        const [start, end] = text.buffer.get_bounds();
        state.set_state(new GLib.Variant('s', text.buffer.get_text(start, end, true)));
    });
    app.add_action(state);
    const about = new Gio.SimpleAction({name: 'about', state: new GLib.Variant('i', 0)});
    about.connect('activate', () => about.set_state(new GLib.Variant('i', about.state.get_int32() + 1)));
    app.add_action(about);
    const copy = new Gio.SimpleAction({name: 'copy'});
    copy.connect('activate', () => text.buffer.copy_clipboard(text.get_clipboard()));
    app.add_action(copy);
    window.present();
    text.grab_focus();
});
app.run([]);
