/**
 * Build the Apple menu (leftmost in macOS menu bar).
 * Always present regardless of focused app.
 */
export function buildAppleMenu() {
    return [
        { label: "About This Mac", action: "about-this-mac" },
        { type: "separator" },
        { label: "System Settings", action: "system-settings" },
        { label: "App Store", action: "app-store" },
        { type: "separator" },
        { type: "recent-submenu", label: "Recent Items" },
        { type: "separator" },
        { label: "Force Quit...", action: "force-quit" },
        { type: "separator" },
        { label: "Sleep", action: "sleep" },
        { label: "Restart", action: "restart" },
        { label: "Shut Down", action: "shut-down" },
        { type: "separator" },
        { label: "Lock Screen", action: "lock-screen" },
        { label: "Log Out...", action: "log-out" },
    ];
}
