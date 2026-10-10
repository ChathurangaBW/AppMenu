import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
function assert(v, message = 'Assertion failed') { if (!v) throw new Error(message); }
export async function run() {
    if (!GLib.get_home_dir().startsWith('/tmp/opencode/appmenu-qa/')) throw new Error('Isolated QA home required');
    const ext = Main.extensionManager.lookup('appmenu@ChathurangaBW.github.io').stateObj;
    const uri = ext.dir.get_uri();
    const {fileActions} = await import(`${uri}/actions/fileActions.js`);
    const {viewActions} = await import(`${uri}/actions/viewActions.js`);
    const results = [];
    async function test(name, fn) {
        try { await fn(); results.push({name, pass: true}); }
        catch (e) { results.push({name, pass: false, error: `${e}`, stack: e.stack}); }
    }
    const settings = new Gio.Settings({schema_id: 'org.gnome.nautilus.preferences'});
    const saved = new Map(settings.list_keys().map(k => [k, settings.get_user_value(k)]));
    try {
        for (const [action, key, value] of [
            ['nautilus-icon-view', 'default-folder-viewer', 'icon-view'],
            ['nautilus-list-view', 'default-folder-viewer', 'list-view'],
            ['nautilus-sort-name', 'default-sort-order', 'name'],
            ['nautilus-sort-date', 'default-sort-order', 'mtime'],
            ['nautilus-sort-size', 'default-sort-order', 'size'],
            ['nautilus-sort-type', 'default-sort-order', 'type'],
        ]) await test(`View settings: ${action}`, () => {
            viewActions[action](); assert(settings.get_string(key) === value);
        });
        for (const [action, key] of [
            ['nautilus-reverse-sort', 'default-sort-in-reverse-order'],
            ['nautilus-toggle-path-bar', 'always-use-location-entry'],
            ['nautilus-toggle-hidden', 'show-hidden-files'],
        ]) await test(`View toggle: ${action}`, () => {
            const before = settings.get_boolean(key);
            viewActions[action](); assert(settings.get_boolean(key) !== before);
        });
    } finally {
        for (const [key, value] of saved) {
            if (value) settings.set_value(key, value); else settings.reset(key);
        }
    }
    // Inspect command dispatch without suspending/shutting down the host or
    // opening personal files. These are routing checks, not end-to-end actions.
    const spawn = Gio.Subprocess.new;
    try {
        for (const action of ['about-this-mac', 'system-settings', 'app-store', 'force-quit',
            'sleep', 'restart', 'shut-down', 'lock-screen', 'log-out', 'open-settings-ext',
            'open-finder', 'new-finder-win', 'open-settings', 'empty-bin', 'go-home',
            'go-recents', 'go-documents', 'go-desktop', 'go-downloads', 'go-computer',
            'go-network', 'go-applications', 'go-utilities', 'open-system-help']) {
            await test(`Command routing only: ${action}`, () => {
                const commands = [];
                Gio.Subprocess.new = argv => { commands.push(argv); return null; };
                fileActions[action]({});
                assert(commands.length === 1 && commands[0].length > 0);
            });
        }
    } finally { Gio.Subprocess.new = spawn; }
    await test('Recent document: load actual XBEL entry and render tooltip', async () => {
        const path = `${GLib.get_home_dir()}/QA document.txt`;
        GLib.file_set_contents(path, 'Disposable QA document');
        const fileUri = Gio.File.new_for_path(path).get_uri();
        const bookmarks = new GLib.BookmarkFile();
        bookmarks.set_title(fileUri, 'QA document');
        bookmarks.set_mime_type(fileUri, 'text/plain');
        bookmarks.add_application(fileUri, 'AppMenu QA', 'true %u');
        bookmarks.to_file(`${GLib.get_user_data_dir()}/recently-used.xbel`);
        ext._menuManager.updateMenuForWindow(null, true);
        const parent = ext._menuManager._buttons[0].menu;
        const recent = parent._getMenuItems().find(item => typeof item._ensureRecentMenu === 'function');
        const items = await recent._getRecentItems();
        assert(items.some(i => i.uri === fileUri), 'XBEL document not found');
        assert(recent._formatDocumentTooltip(fileUri) === path);
        parent.open();
        const menu = await recent._ensureRecentMenu();
        assert(menu.numMenuItems > 0);
        menu.open();
        await delay(150);
        parent.close();
    });
    await test('Recent document: clear disposable history', async () => {
        const parent = ext._menuManager._buttons[0].menu;
        const recent = parent._getMenuItems().find(item => typeof item._ensureRecentMenu === 'function');
        recent._clearRecentItems();
        await delay(100);
        assert((await recent._getRecentItems()).length === 0);
    });
    return {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results};
}
