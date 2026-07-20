/**
 * Build the app-name submenu.
 * Dynamic — depends on the currently focused app and its open windows.
 */
export function buildAppMenu(appName, detectedApp, focusedWindow = null, preferMacosStyle = true) {
    const children = [];

    const canOpenPreferences = Boolean(detectedApp?.get_app_info?.());

    if (!preferMacosStyle) {
        if (detectedApp) {
            const openWindows = detectedApp.get_windows();
            if (openWindows.length > 0) {
                children.push({ type: "section-header", label: "Open Windows" });
                openWindows.forEach(win => {
                    children.push({
                        label: win.get_title() || appName,
                        action: `activate-window:${win.get_id()}`,
                    });
                });
                children.push({ type: "separator" });
            }
        }

        children.push(
            { label: "New Window", action: "new-app-window" },
            { type: "separator" },
            { label: "App Details", action: `app-details:${detectedApp ? detectedApp.get_id() : ''}`, sensitive: Boolean(detectedApp?.get_id?.()) },
            { type: "separator" },
            { label: `Quit ${appName}`, action: "close" },
        );

        return children;
    }

    children.push(
        { label: `About ${appName}`, action: `app-details:${detectedApp ? detectedApp.get_id() : ''}`, sensitive: Boolean(detectedApp?.get_id?.()) },
        { type: "separator" },
        { label: "Settings…", action: "open-app-preferences", sensitive: canOpenPreferences },
        { type: "separator" },
        { label: `Hide ${appName}`, action: "hide-app", sensitive: Boolean(focusedWindow) },
        { label: "Hide Others", action: "hide-others", sensitive: Boolean(focusedWindow) },
        { label: "Show All", action: "show-all" },
        { type: "separator" }
    );

    if (detectedApp) {
        const openWindows = detectedApp.get_windows();
        if (openWindows.length > 0) {
            children.push({ type: "section-header", label: "Open Windows" });
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
        { label: "New Window", action: "new-app-window" },
        { type: "separator" },
        { label: `Quit ${appName}`, action: "close" },
    );

    return children;
}

// Cached fallback menu — computed once, never changes
const FALLBACK_MENU = [
    { label: "About AppMenu", action: "about-appmenu" },
    { type: "separator" },
    { label: "AppMenu Settings…", action: "open-settings-ext" },
    { type: "separator" },
    { label: "Hide AppMenu", action: "hide-app" },
    { label: "Hide Others", action: "hide-others" },
    { label: "Show All", action: "show-all" },
    { type: "separator" },
    { label: "Force Quit…", action: "force-quit" },
    { type: "separator" },
    { label: "Empty Trash...", action: "empty-bin" },
];

/**
 * Build the fallback app menu when no app is focused (desktop/Finder state).
 * Mirrors macOS Finder's app menu.
 */
export function buildFallbackAppMenu() {
    return FALLBACK_MENU;
}
