export function buildFileMenu() {
    return [
        { label: "New Finder Window", action: "new-finder-win" },
        { label: "New Folder", action: "new-folder" },
        { label: "New Tab", action: "new-tab" },
        { label: "Open", action: "virtual-open" },
        { label: "Open With", action: "native-open-with" },
        { label: "Print", action: "print" },
        { type: "separator" },
        { label: "Get Info", action: "properties" },
        { label: "Rename", action: "rename-file" },
        { type: "separator" },
        { label: "Find", action: "find" },
        { type: "separator" },
        { label: "Move to Trash", action: "delete-item" },
        { label: "Eject", action: "eject" },
        { type: "separator" },
        { label: "Close Window", action: "close" },
    ];
}
