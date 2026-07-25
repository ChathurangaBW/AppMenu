/**
 * Build the Window menu.
 * Dynamic — depends on the currently focused window and its state.
 */
import Meta from 'gi://Meta';
import { _ } from '../i18n.js';

export function buildWindowMenu(window, detectedApp = null) {
    const hasWindow = Boolean(window);
    const canMinimize = hasWindow && window.get_window_type() === Meta.WindowType.NORMAL;
    const canMaximize = canMinimize;
    const canTile = canMinimize;
    const canBringAllToFront = Boolean(detectedApp?.get_windows?.()?.length > 1);

    // Workspace check
    let hasPrevWorkspace = false;
    let hasNextWorkspace = false;
    try {
        const workspaceManager = global.workspace_manager;
        const activeIdx = workspaceManager.get_active_workspace_index();
        hasPrevWorkspace = activeIdx > 0;
        hasNextWorkspace = activeIdx < workspaceManager.n_workspaces - 1;
    } catch (_e) { /* glass */ }

    return [
        { label: _("Minimize"), action: "minimize", sensitive: canMinimize },
        { label: _("Maximize"), action: "maximize", sensitive: hasWindow },
        { type: "separator" },
        { label: _("Tile Left"), action: "tile-left", sensitive: canTile },
        { label: _("Tile Right"), action: "tile-right", sensitive: canTile },
        { type: "separator" },
        { label: _("Previous Workspace"), action: "workspace-prev", sensitive: hasPrevWorkspace },
        { label: _("Next Workspace"), action: "workspace-next", sensitive: hasNextWorkspace },
        { label: _("Move Window Left"), action: "move-workspace-left", sensitive: hasWindow && hasPrevWorkspace },
        { label: _("Move Window Right"), action: "move-workspace-right", sensitive: hasWindow && hasNextWorkspace },
        { type: "separator" },
        { label: _("Bring All to Front"), action: "bring-all-front", sensitive: canBringAllToFront },
        { type: "separator" },
        { label: _("Close"), action: "close", sensitive: hasWindow },
    ];
}
