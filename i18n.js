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

/**
 * Bind the gettext domain. Safe to call multiple times (idempotent).
 * @param {Extension} extensionObject — your extension's `this`
 */
export function initI18n(extensionObject) {
    if (_initialized) return;
    try {
        const localeDir = extensionObject.dir.get_child('locale').get_path();
        GLib.bindtextdomain(DOMAIN, localeDir);
        GLib.bind_textdomain_codeset(DOMAIN, 'UTF-8');
        GLib.textdomain(DOMAIN);
        _initialized = true;
    } catch (e) {
        log(`AppMenu i18n: ${e}`);
    }
}

/**
 * Translate a string. Falls back to the input when no translation exists.
 * @param {string} str
 * @returns {string}
 */
export function _(str) {
    return GLib.dgettext(DOMAIN, str);
}
