import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
function assert(v, message = 'Assertion failed') { if (!v) throw new Error(message); }
export async function run() {
    if (!GLib.get_home_dir().startsWith('/tmp/opencode/appmenu-qa/')) throw new Error('Isolated QA home required');
    const extension = Main.extensionManager.lookup('appmenu@ChathurangaBW.github.io');
    const ext = extension.stateObj;
    const uri = extension.dir.get_uri();
    const {windowActions} = await import(`${uri}/actions/windowActions.js`);
    const {executeKeyboardAction} = await import(`${uri}/actions/keyboardActions.js`);
    const {RealMenuManager} = await import(`${uri}/realMenuManager.js`);
    const results = [];
    async function test(name, fn) {
        try { await fn(); results.push({name, pass: true}); }
        catch (e) { results.push({name, pass: false, error: `${e}`, stack: e.stack}); }
    }
    const win = global.get_window_actors().map(a => a.meta_window).find(w => w.get_title() === 'AppMenu QA fixture');
    assert(win, 'Start scripts/qa-app.js in the test compositor first');
    Main.overview.hide();
    win.activate(global.get_current_time());
    await delay(250);
    const app = Shell.WindowTracker.get_default().get_window_app(win);
    const ctx = {window: win, app};
    const manager = ext._menuManager;
    async function call(method, args) {
        return Gio.DBus.session.call('org.example.AppMenuQA', '/org/example/AppMenuQA', 'org.gtk.Actions', method,
            args, null, Gio.DBusCallFlags.NONE, 3000, null);
    }
    async function describe() { return (await call('DescribeAll', null)).deepUnpack()[0]; }
    const text = async () => (await describe()).text[2][0].deepUnpack();
    await test('Application focus: app label follows GTK window', () => {
        manager.updateMenuForWindow(win, true);
        assert(manager._lastDiagnostics.appName !== 'Desktop');
    });
    await test('Real GTK menu discovery and native action activation', async () => {
        const real = new RealMenuManager(ext._settings, () => {});
        try {
            real.updateForWindow(win, 'QA', {get_id: () => 'org.example.AppMenuQA.desktop'});
            for (let i = 0; i < 30 && !real.buildCurrentMenuModel(); i++) await delay(100);
            const model = real.buildCurrentMenuModel();
            assert(model && model.topLevelMenus.length > 0, 'No GTK action menus');
            const before = (await describe()).about[2][0].deepUnpack();
            await real._activateGtkAction('about');
            const after = (await describe()).about[2][0].deepUnpack();
            assert(after === before + 1, 'Native action not delivered');
        } finally { real.destroy(); }
    });
    await test('Keyboard end-to-end: select all, copy, cut, paste in GTK text view', async () => {
        await call('Activate', new GLib.Variant('(sava{sv})', ['text', [new GLib.Variant('s', 'AppMenu clipboard QA')], {}]));
        win.activate(global.get_current_time());
        await delay(150);
        for (const action of ['select-all', 'copy', 'cut']) {
            assert(executeKeyboardAction(action, manager, win));
            await delay(150);
        }
        assert(await text() === '', 'Cut did not remove selected text');
        executeKeyboardAction('paste', manager, win);
        await delay(200);
        assert(await text() === 'AppMenu clipboard QA', 'Paste did not restore text');
    });
    await test('Custom accelerator end-to-end: select all', async () => {
        manager._buttons[0]._sendAccelerator('<Control>a');
        await delay(150);
        executeKeyboardAction('cut', manager, win);
        await delay(150);
        assert(await text() === '');
        executeKeyboardAction('paste', manager, win);
        await delay(150);
    });
    await test('Window: maximize and restore', async () => {
        windowActions.maximize(ctx);
        await delay(200);
        assert(win.is_maximized());
        windowActions.maximize(ctx);
        await delay(200);
        assert(!win.is_maximized());
    });
    await test('Window: minimize and bring all front', async () => {
        windowActions.minimize(ctx);
        await delay(150);
        assert(win.minimized);
        windowActions['bring-all-front']();
        await delay(150);
        assert(!win.minimized);
    });
    for (const side of ['left', 'right']) {
        await test(`Window: tile ${side}`, async () => {
            win.activate(global.get_current_time());
            await delay(100);
            windowActions[`tile-${side}`]();
            await delay(200);
            const area = win.get_work_area_for_monitor(win.get_monitor());
            const frame = win.get_frame_rect();
            assert(Math.abs(frame.width - Math.floor(area.width / 2)) <= 4);
        });
    }
    await test('Workspaces: move window right then left', async () => {
        // Dynamic workspaces remove the vacated workspace and renumber indices.
        const mutter = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        const wm = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        const dynamic = mutter.get_boolean('dynamic-workspaces');
        const count = wm.get_int('num-workspaces');
        try {
            wm.set_int('num-workspaces', 4);
            mutter.set_boolean('dynamic-workspaces', false);
            win.activate(global.get_current_time());
            await delay(150);
            const start = win.get_workspace().index();
            windowActions['move-workspace-right']();
            await delay(200);
            assert(win.get_workspace().index() === start + 1);
            win.activate(global.get_current_time());
            windowActions['move-workspace-left']();
            await delay(200);
            assert(win.get_workspace().index() === start);
        } finally {
            mutter.set_boolean('dynamic-workspaces', dynamic);
            wm.set_int('num-workspaces', count);
        }
    });
    await test('Window: native fullscreen state toggles', async () => {
        // Fixture has no app-specific F11 handler; exercise native window state.
        win.make_fullscreen();
        await delay(150);
        assert(win.is_fullscreen());
        win.unmake_fullscreen();
        await delay(150);
        assert(!win.is_fullscreen());
    });
    await test('Window: close disposable GTK fixture', async () => {
        windowActions.close(ctx);
        await delay(200);
        assert(!global.get_window_actors().some(a => a.meta_window === win));
    });
    return {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results};
}
