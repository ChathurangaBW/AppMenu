import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as SC from './scancodes.js';
import * as Logger from '../logger.js';

// Each entry: [modifierScanCode, actionScanCode, useModifier]
// useModifier=false means only the action key is pressed (no Ctrl/Shift/Alt held)
const SHORTCUT_MAP = {
    'copy':             [SC.KEY_CTRL, SC.KEY_C, true],
    'paste':            [SC.KEY_CTRL, SC.KEY_V, true],
    'cut':              [SC.KEY_CTRL, SC.KEY_X, true],
    'undo':             [SC.KEY_CTRL, SC.KEY_Z, true],
    'redo':             [SC.KEY_CTRL, SC.KEY_Y, true],
    'select-all':       [SC.KEY_CTRL, SC.KEY_A, true],
    'new-tab':          [SC.KEY_CTRL, SC.KEY_T, true],
    'print':            [SC.KEY_CTRL, SC.KEY_P, true],
    'emoji-picker':     [SC.KEY_CTRL, SC.KEY_PERIOD, true],
    'toggle-fullscreen': [0, SC.KEY_F11, false],
    'go-back':          [SC.KEY_ALT, SC.KEY_LEFT, true],
    'go-forward':       [SC.KEY_ALT, SC.KEY_RIGHT, true],
    'delete-item':      [0, SC.KEY_DELETE, false],
    'virtual-open':     [0, SC.KEY_ENTER, false],
    'properties':       [SC.KEY_ALT, SC.KEY_ENTER, true],
    'rename-file':      [0, SC.KEY_F2, false],
    'find':             [SC.KEY_CTRL, SC.KEY_F, true],
};

function sendKey(virtualDevice, timeUs, scanCode, state) {
    virtualDevice.notify_key(timeUs, scanCode, state);
}

function simulateShortcut(virtualDevice, modifier, action, useModifier) {
    const t = GLib.get_monotonic_time();
    if (useModifier) {
        sendKey(virtualDevice, t, modifier, Clutter.KeyState.PRESSED);
        sendKey(virtualDevice, t + 10, action, Clutter.KeyState.PRESSED);
        sendKey(virtualDevice, t + 20, action, Clutter.KeyState.RELEASED);
        sendKey(virtualDevice, t + 30, modifier, Clutter.KeyState.RELEASED);
    } else {
        sendKey(virtualDevice, t, action, Clutter.KeyState.PRESSED);
        sendKey(virtualDevice, t + 10, action, Clutter.KeyState.RELEASED);
    }
}

function simulateNativeOpenWith(virtualDevice, manager) {
    const t = GLib.get_monotonic_time();
    sendKey(virtualDevice, t, SC.KEY_SHIFT, Clutter.KeyState.PRESSED);
    sendKey(virtualDevice, t + 10, SC.KEY_F10, Clutter.KeyState.PRESSED);
    sendKey(virtualDevice, t + 20, SC.KEY_F10, Clutter.KeyState.RELEASED);
    sendKey(virtualDevice, t + 30, SC.KEY_SHIFT, Clutter.KeyState.RELEASED);

    const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
        const now = GLib.get_monotonic_time();
        sendKey(virtualDevice, now, SC.KEY_H, Clutter.KeyState.PRESSED);
        sendKey(virtualDevice, now + 10, SC.KEY_H, Clutter.KeyState.RELEASED);
        if (manager) manager._timeoutIds = manager._timeoutIds.filter(id => id !== timeoutId);
        return GLib.SOURCE_REMOVE;
    });

    if (manager) manager._timeoutIds.push(timeoutId);
}

/**
 * Try to execute a keyboard shortcut action.
 * Returns true if handled, false if the action is not a keyboard action.
 *
 * Uses the cached virtual device from MenuManager when available,
 * falling back to creating a new one if no manager is provided.
 */
export function executeKeyboardAction(action, manager) {
    const vd = manager ? manager.getVirtualDevice() : null;

    if (action === 'native-open-with') {
        try {
            const device = vd || (() => {
                const seat = Clutter.get_default_backend().get_default_seat();
                return seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            })();
            if (device) simulateNativeOpenWith(device, manager);
            return true;
        } catch (e) {
            Logger.error(`Virtual keyboard error: ${e}`);
            return false;
        }
    }

    const entry = SHORTCUT_MAP[action];
    if (!entry) return false;

    try {
        const device = vd || (() => {
            const seat = Clutter.get_default_backend().get_default_seat();
            return seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        })();
        if (device) simulateShortcut(device, entry[0], entry[1], entry[2]);
        return true;
    } catch (e) {
        Logger.error(`Virtual keyboard error: ${e}`);
        return false;
    }
}
