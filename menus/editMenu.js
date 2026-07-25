import { _ } from '../i18n.js';

export function buildEditMenu() {
    return [
        { label: _("Undo"), action: "undo" },
        { label: _("Redo"), action: "redo" },
        { type: "separator" },
        { label: _("Cut"), action: "cut" },
        { label: _("Copy"), action: "copy" },
        { label: _("Paste"), action: "paste" },
        { label: _("Delete"), action: "delete-item" },
        { type: "separator" },
        { label: _("Select All"), action: "select-all" },
        { type: "separator" },
        { label: _("Emoji & Symbols"), action: "emoji-picker" },
    ];
}
