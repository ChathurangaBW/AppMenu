import { _ } from '../i18n.js';

export function buildHelpMenu() {
    return [
        { label: _("Send Feedback"), action: "send-feedback" },
    ];
}
