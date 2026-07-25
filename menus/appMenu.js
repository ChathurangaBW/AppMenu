/**
 * Build the app-name submenu.
 * Dynamic — depends on the currently focused app and its open windows.
 */
import { _ } from '../i18n.js';

export function buildAppMenu(appName, detectedApp, focusedWindow = null) {
    const children = [];

    const canOpenPreferences = Boolean(detectedApp?.get_app_info?.());

    children.push(
        { label: _("About %s").replace('%s', appName), action: `app-details:${detectedApp ? detectedApp.get_id() : ''}`, sensitive: Boolean(detectedApp?.get_id?.()) },
        { type: "separator" },
        { label: _("Settings"), action: "open-app-preferences", sensitive: canOpenPreferences },
        { type: "separator" },
        { label: _("Hide %s").replace('%s', appName), action: "hide-app", sensitive: Boolean(focusedWindow) },
        { label: _("Hide Others"), action: "hide-others", sensitive: Boolean(focusedWindow) },
        { label: _("Show All"), action: "show-all" },
        { type: "separator" }
    );

    if (detectedApp) {
        const openWindows = detectedApp.get_windows();
        if (openWindows.length > 0) {
            children.push({ type: "section-header", label: _("Open Windows") });
            openWindows.forEach(win => {
                children.push({
                    label: win.get_title() || appName,
                    action: `activate-window:${win.get_id()}`,
                    ornament: focusedWindow && win.get_id() === focusedWindow.get_id() ? 'dot' : 'none',
                });
            });
            children.push({ type: "separator" });
        }
    }

    children.push(
        { label: _("New Window"), action: "new-app-window" },
        { type: "separator" },
        { label: _("Quit %s").replace('%s', appName), action: "close" },
    );

    return children;
}

/**
 * Build the fallback app menu when no app is focused (desktop state).
 * Mirrors the file-manager app menu. Built fresh each call for i18n.
 */
export function buildFallbackAppMenu() {
    return [
        { label: _("About AppMenu"), action: "about-appmenu" },
        { type: "separator" },
        { label: _("AppMenu Settings"), action: "open-settings-ext" },
        { type: "separator" },
        { label: _("Hide AppMenu"), action: "hide-app" },
        { label: _("Hide Others"), action: "hide-others" },
        { label: _("Show All"), action: "show-all" },
        { type: "separator" },
        { label: _("Force Quit…"), action: "force-quit" },
        { type: "separator" },
        { label: _("Empty Trash..."), action: "empty-bin" },
    ];
}
