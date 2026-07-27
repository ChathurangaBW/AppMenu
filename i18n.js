/**
 * AppMenu i18n — GNOME Shell gettext wrapper.
 *
 * Call initI18n(extensionObject) once in extension enable() before any menus
 * are built. Then import { _ } from './i18n.js' and wrap every user-facing
 * string with _("...").
 */
import GLib from 'gi://GLib';

const DOMAIN = 'appmenu';
let _initialized = false;
let _translate = str => GLib.dgettext(DOMAIN, str);

/**
 * Bind the gettext domain. Safe to call multiple times (idempotent).
 * @param {Extension} extensionObject — your extension's `this`
 */
export function initI18n(extensionObject) {
    if (_initialized) return;

    try {
        if (extensionObject && typeof extensionObject.gettext === 'function')
            _translate = extensionObject.gettext.bind(extensionObject);
    } catch (e) {
        log(`AppMenu i18n: falling back to GLib.dgettext: ${e}`);
    } finally {
        _initialized = true;
    }
}

/**
 * Translate a string. Falls back to the input when no translation exists.
 * @param {string} str
 * @returns {string}
 */
export function _(str) {
    try {
        return _translate(str);
    } catch (e) {
        return str;
    }
}
