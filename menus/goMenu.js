import { _ } from '../i18n.js';

export function buildGoMenu() {
    return [
        { label: _("Back"), action: "go-back" },
        { label: _("Forward"), action: "go-forward" },
        { type: "separator" },
        { label: _("Recents"), action: "go-recents" },
        { label: _("Documents"), action: "go-documents" },
        { label: _("Desktop"), action: "go-desktop" },
        { label: _("Downloads"), action: "go-downloads" },
        { label: _("Home"), action: "go-home" },
        { type: "separator" },
        { label: _("Computer"), action: "go-computer" },
        { label: _("Network"), action: "go-network" },
        { label: _("Applications"), action: "go-applications" },
        { label: _("Utilities"), action: "go-utilities" },
    ];
}
