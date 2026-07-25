import { _ } from '../i18n.js';

export function buildFileMenu() {
    return [
        { label: _("Open Home"), action: "new-finder-win" },
        { label: _("New Folder"), action: "new-folder" },
        { label: _("New Tab"), action: "new-tab" },
        { label: _("Open"), action: "virtual-open" },
        { label: _("Open With"), action: "native-open-with" },
        { label: _("Print"), action: "print" },
        { type: "separator" },
        { label: _("Get Info"), action: "properties" },
        { label: _("Rename"), action: "rename-file" },
        { type: "separator" },
        { label: _("Find"), action: "find" },
        { type: "separator" },
        { label: _("Move to Trash"), action: "delete-item" },
        { label: _("Eject"), action: "eject" },
        { type: "separator" },
        { label: _("Close Window"), action: "close" },
    ];
}
