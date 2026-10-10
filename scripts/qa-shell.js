// Import only in an isolated GNOME Shell with the extension enabled.
// Example: import('file:///path/to/scripts/qa-shell.js').then(m => m.run())
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const UUID = 'appmenu@ChathurangaBW.github.io';
const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));
function assert(value, message = 'Assertion failed') {
    if (!value) throw new Error(message);
}

export async function run() {
    if (!GLib.get_home_dir().startsWith('/tmp/opencode/appmenu-qa/'))
        throw new Error('Run with an isolated QA home; this suite changes test settings.');
    const results = [];
    async function test(name, fn) {
        try { await fn(); results.push({name, pass: true}); }
        catch (e) { results.push({name, pass: false, error: `${e}`, stack: e.stack}); }
    }
    const extension = Main.extensionManager.lookup(UUID);
    const ext = extension.stateObj;
    const uri = extension.dir.get_uri();
    const settings = ext._settings;
    const saved = new Map(settings.list_keys().map(k => [k, settings.get_user_value(k)]));
    const manager = ext._menuManager;
    const search = await import(`${uri}/searchDialog.js`);
    const compat = await import(`${uri}/compatibility.js`);
    const keyboard = await import(`${uri}/actions/keyboardActions.js`);
    const accelerator = await import(`${uri}/actions/accelerator.js`);
    const {RealMenuManager} = await import(`${uri}/realMenuManager.js`);
    try {
        await test('Startup: ACTIVE with eight fallback panel menus', () => {
            assert(extension.state === 1);
            assert(manager._buttons.length === 8);
        });
        await test('Layout: horizontal and vertical GNOME 51 actors', () => {
            for (const vertical of [true, false]) {
                const box = compat.boxLayout(vertical);
                assert(box.orientation === (vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL));
                box.destroy();
            }
        });
        await test('All top-level fallback menus open and close', async () => {
            Main.overview.hide();
            for (const button of manager._buttons) {
                button.menu.open();
                assert(button.menu.isOpen);
                assert(button.menu.numMenuItems > 0);
                button.menu.close();
            }
            await delay(200);
        });
        await test('Appearance: hide and restore OS icon', () => {
            settings.set_boolean('show-os-icon', false);
            assert(!manager._buttons[0].visible);
            settings.set_boolean('show-os-icon', true);
            assert(manager._buttons[0].visible);
        });
        await test('Appearance: icon size', () => {
            settings.set_int('icon-size', 30);
            assert(manager._buttons[0]._titleWidget.icon_size === 30);
        });
        await test('User switcher: asynchronous avatar/menu build', async () => {
            settings.set_boolean('show-user-switcher', true);
            const button = ext._userSwitcherController._userSwitcher;
            assert(button, 'AccountsService/user switcher unavailable');
            await button._rebuildMenu();
            assert(button.menu.numMenuItems >= 5);
            button.menu.open();
            await delay(250);
            button.menu.close();
        });
        await test('User switcher: disable and recreate', () => {
            settings.set_boolean('show-user-switcher', false);
            assert(ext._userSwitcherController._userSwitcher === null);
            settings.set_boolean('show-user-switcher', true);
            assert(ext._userSwitcherController._userSwitcher !== null);
        });
        await test('Workspaces: indicator count and both panel positions', () => {
            settings.set_boolean('show-workspace-indicator', true);
            for (const position of ['left', 'right']) {
                settings.set_string('workspace-indicator-position', position);
                const indicator = ext._workspaceIndicatorController._indicator;
                assert(indicator._label.text.split(' ').length === global.workspace_manager.n_workspaces);
                assert(indicator.container.get_parent() === Main.panel[`_${position}Box`]);
            }
            settings.set_boolean('show-workspace-indicator', false);
            assert(ext._workspaceIndicatorController._indicator === null);
        });
        await test('Search: open and render default results', () => {
            search.toggleSearchDialog();
            const dialog = Main.layoutManager.modalDialogGroup.get_children().find(a => a._entry);
            assert(dialog && dialog._resultButtons.length > 0);
        });
        const dialog = Main.layoutManager.modalDialogGroup.get_children().find(a => a._entry);
        if (dialog) {
            await test('Search: unmatched query yields empty state', () => {
                dialog._search('zzzznonexistent987654321');
                assert(dialog._resultButtons.length === 0, 'Unrelated results returned');
            });
            await test('Search: matched settings results', () => {
                dialog._search('Wi-Fi');
                assert(dialog._resultButtons.length > 0);
            });
            await test('Search: debounce preserves typing focus', async () => {
                dialog._entry.grab_key_focus();
                dialog._entry.set_text('Network');
                await delay(300);
                assert(global.stage.key_focus === dialog._entry.clutter_text, 'Search stole typing focus');
            });
            await test('Search: keyboard selection wraps', () => {
                dialog._search('');
                dialog._setSelectedIndex(dialog._resultButtons.length - 1);
                dialog._moveSelection(1);
                assert(dialog._selectedIndex === 0);
            });
        }
        search.destroySearchDialog();
        await test('Search: repeated open/destroy lifecycle', () => {
            for (let i = 0; i < 3; i++) {
                search.toggleSearchDialog();
                search.destroySearchDialog();
            }
        });
        await test('Keyboard: virtual device creation', () => assert(manager.getVirtualDevice()));
        for (const action of ['copy', 'paste', 'cut', 'undo', 'redo', 'select-all', 'new-tab', 'print',
            'emoji-picker', 'toggle-fullscreen', 'go-back', 'go-forward', 'delete-item', 'virtual-open',
            'properties', 'rename-file', 'find']) {
            await test(`Keyboard dispatch: ${action}`, () => assert(keyboard.executeKeyboardAction(action, manager)));
        }
        await test('Custom shortcuts: modifiers, named keys, invalid input', () => {
            const [ok, key, mods] = accelerator.parseAccelerator('<Primary><Shift>a');
            assert(ok && key === Clutter.KEY_a && (mods & Clutter.ModifierType.CONTROL_MASK));
            assert(accelerator.parseAccelerator('F12')[1] === Clutter.KEY_F12);
            assert(!accelerator.parseAccelerator('<Bogus>a')[0]);
            assert(!accelerator.parseAccelerator('NotAKey')[0]);
            manager._buttons[0]._sendAccelerator('<Control>a');
        });
        await test('Custom menu: configure and render', () => {
            settings.set_string('custom-app-menus', JSON.stringify([{label: 'QA custom', items: [
                {label: 'Test', kind: 'shortcut', value: '<Control>a'},
            ]}]));
            manager.updateMenuForWindow(null, true);
            assert(manager._buttons.at(-1)._titleWidget.text === 'QA custom');
            settings.set_string('custom-app-menus', '[]');
            manager.updateMenuForWindow(null, true);
        });
        await test('Diagnostics: copy status to clipboard', async () => {
            manager._copyTroubleshootingInfo();
            const text = await new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, t) => resolve(t)));
            assert(text.includes('GNOME Shell: 51') && text.includes(UUID));
        });
        await test('Real menu: invalid application IDs fall back cleanly', async () => {
            const real = new RealMenuManager(settings, () => {});
            for (const id of ['firefox', 'bad/id', '', 'app-without-dbus.desktop']) {
                const window = {get_id: () => 0};
                assert(real.updateForWindow(window, 'QA', {get_id: () => id}) === null);
                await delay(20);
            }
            real.destroy();
        });
        await test('Recent items: populate, open, close and destroy', async () => {
            manager.updateMenuForWindow(null, true);
            const parent = manager._buttons[0].menu;
            const recent = parent._getMenuItems().find(item => typeof item._ensureRecentMenu === 'function');
            assert(recent, 'Recent submenu missing');
            parent.open();
            const menu = await recent._ensureRecentMenu();
            assert(menu && menu.numMenuItems > 0);
            menu.open();
            menu.close();
            parent.close();
        });
    } finally {
        search.destroySearchDialog();
        for (const [key, value] of saved) {
            if (value) settings.set_value(key, value);
            else settings.reset(key);
        }
        manager.updateMenuForWindow(null, true);
    }
    await test('Lifecycle: three enable/disable cycles without panel leaks', async () => {
        for (let i = 0; i < 3; i++) {
            await Main.extensionManager.disableExtension(UUID);
            await delay(100);
            assert(!Object.keys(Main.panel.statusArea).some(k => k.startsWith(UUID)));
            await Main.extensionManager.enableExtension(UUID);
            await delay(250);
            assert(extension.state === 1);
            assert(extension.stateObj._menuManager._buttons.length === 8);
        }
    });
    return {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results};
}
