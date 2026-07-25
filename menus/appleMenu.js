/**
 * Build the Apple menu (leftmost in macOS menu bar).
 * Always present regardless of focused app.
 */
import { _ } from '../i18n.js';

export function buildAppleMenu() {
    return [
        { label: _("About This System"), action: "about-this-mac" },
        { type: "separator" },
        { label: _("System Settings"), action: "system-settings" },
        { label: _("Software"), action: "app-store" },
        { type: "separator" },
        { type: "recent-submenu", label: _("Recent Items") },
        { label: _("Search..."), action: "open-search" },
        { type: "separator" },
        { label: _("Force Quit..."), action: "force-quit" },
        { type: "separator" },
        { label: _("Sleep"), action: "sleep" },
        { label: _("Restart"), action: "restart" },
        { label: _("Shut Down"), action: "shut-down" },
        { type: "separator" },
        { label: _("Lock Screen"), action: "lock-screen" },
        { label: _("Log Out..."), action: "log-out" },
    ];
}
