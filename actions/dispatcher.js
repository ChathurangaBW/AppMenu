import { windowActions } from './windowActions.js';
import { fileActions } from './fileActions.js';
import { viewActions } from './viewActions.js';
import { executeKeyboardAction } from './keyboardActions.js';
import * as Logger from '../logger.js';
import { toggleSearchDialog } from '../searchDialog.js';

/**
 * Action dispatcher — registry of all named actions.
 *
 * Each handler receives:
 *   ctx    — { window, app, desktopId }
 *   param  — optional string after the colon (e.g. "activate-window:123" → "123")
 *   manager — the MenuManager instance (for timeout tracking)
 *
 * Actions that are virtual-keyboard shortcuts are handled by keyboardActions
 * as a fallback, so they don't need entries here.
 */
const registry = { ...windowActions, ...fileActions, ...viewActions };

/**
 * Dispatch an action string.
 * Format: "action-name" or "action-name:param"
 * Returns true if handled.
 */
export function dispatch(actionStr, ctx, manager) {
    if (actionStr === 'open-search') {
        toggleSearchDialog();
        return true;
    }
    const colonIdx = actionStr.indexOf(':');
    const action = colonIdx === -1 ? actionStr : actionStr.slice(0, colonIdx);
    const param = colonIdx === -1 ? null : actionStr.slice(colonIdx + 1);

    const handler = registry[action];
    if (handler) {
        try {
            // Await-aware: wrap handler call so async handlers don't silently reject
            const result = handler(ctx, param, manager);
            if (result && typeof result.then === 'function') {
                result.catch(e => Logger.error(`Action "${action}" failed: ${e}`));
            }
            return true;
        } catch (e) {
            Logger.error(`Action "${action}" failed: ${e}`);
            return false;
        }
    }

    // Fallback: keyboard-simulated shortcuts
    if (executeKeyboardAction(action, manager)) return true;

    Logger.warn(`Unknown action: "${action}"`);
    return false;
}
