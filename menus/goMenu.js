export function buildGoMenu() {
    return [
        { label: "Back", action: "go-back" },
        { label: "Forward", action: "go-forward" },
        { type: "separator" },
        { label: "Recents", action: "go-recents" },
        { label: "Documents", action: "go-documents" },
        { label: "Desktop", action: "go-desktop" },
        { label: "Downloads", action: "go-downloads" },
        { label: "Home", action: "go-home" },
        { type: "separator" },
        { label: "Computer", action: "go-computer" },
        { label: "Network", action: "go-network" },
        { label: "Applications", action: "go-applications" },
        { label: "Utilities", action: "go-utilities" },
    ];
}
