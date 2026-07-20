export function buildViewMenu() {
    return [
        { label: "As Icons", action: "nautilus-icon-view" },
        { label: "As List", action: "nautilus-list-view" },
        { type: "separator" },
        { label: "Sort by Name", action: "nautilus-sort-name" },
        { label: "Sort by Date", action: "nautilus-sort-date" },
        { label: "Sort by Size", action: "nautilus-sort-size" },
        { label: "Sort by Kind", action: "nautilus-sort-type" },
        { label: "Reverse Sort Order", action: "nautilus-reverse-sort" },
        { type: "separator" },
        { label: "Toggle Path Bar", action: "nautilus-toggle-path-bar" },
        { label: "Show Hidden Files", action: "nautilus-toggle-hidden" },
        { type: "separator" },
        { label: "Enter Full Screen", action: "toggle-fullscreen" },
    ];
}
