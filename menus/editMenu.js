export function buildEditMenu() {
    return [
        { label: "Undo", action: "undo" },
        { label: "Redo", action: "redo" },
        { type: "separator" },
        { label: "Cut", action: "cut" },
        { label: "Copy", action: "copy" },
        { label: "Paste", action: "paste" },
        { label: "Delete", action: "delete-item" },
        { type: "separator" },
        { label: "Select All", action: "select-all" },
        { type: "separator" },
        { label: "Emoji & Symbols", action: "emoji-picker" },
    ];
}
