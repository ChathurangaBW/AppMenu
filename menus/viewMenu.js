import { _ } from '../i18n.js';

export function buildViewMenu() {
    return [
        { label: _("As Icons"), action: "nautilus-icon-view" },
        { label: _("As List"), action: "nautilus-list-view" },
        { type: "separator" },
        { label: _("Sort by Name"), action: "nautilus-sort-name" },
        { label: _("Sort by Date"), action: "nautilus-sort-date" },
        { label: _("Sort by Size"), action: "nautilus-sort-size" },
        { label: _("Sort by Kind"), action: "nautilus-sort-type" },
        { label: _("Reverse Sort Order"), action: "nautilus-reverse-sort" },
        { type: "separator" },
        { label: _("Toggle Path Bar"), action: "nautilus-toggle-path-bar" },
        { label: _("Show Hidden Files"), action: "nautilus-toggle-hidden" },
        { type: "separator" },
        { label: _("Enter Full Screen"), action: "toggle-fullscreen" },
    ];
}
