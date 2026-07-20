export function buildWindowMenu(window = null, app = null) {
    const hasWindow = Boolean(window);
    const isMinimized = hasWindow
        ? (typeof window.is_minimized === 'function'
            ? window.is_minimized()
            : Boolean(window.minimized))
        : false;
    const canMinimize = hasWindow && !isMinimized;
    const canTile = hasWindow;
    const workspaceManager = global.workspace_manager;
    const activeWorkspaceIndex = workspaceManager?.get_active_workspace_index?.() ?? 0;
    const workspaceCount = workspaceManager?.get_n_workspaces?.() ?? 1;
    const hasPrevWorkspace = activeWorkspaceIndex > 0;
    const hasNextWorkspace = activeWorkspaceIndex < workspaceCount - 1;
    const canBringAllToFront = (app?.get_windows?.().length ?? 0) > 1;

    return [
        { label: "Minimize", action: "minimize", sensitive: canMinimize },
        { label: "Maximize", action: "maximize", sensitive: hasWindow },
        { type: "separator" },
        { label: "Tile Left", action: "tile-left", sensitive: canTile },
        { label: "Tile Right", action: "tile-right", sensitive: canTile },
        { type: "separator" },
        { label: "Previous Workspace", action: "workspace-prev", sensitive: hasPrevWorkspace },
        { label: "Next Workspace", action: "workspace-next", sensitive: hasNextWorkspace },
        { label: "Move Window Left", action: "move-workspace-left", sensitive: hasWindow && hasPrevWorkspace },
        { label: "Move Window Right", action: "move-workspace-right", sensitive: hasWindow && hasNextWorkspace },
        { type: "separator" },
        { label: "Bring All to Front", action: "bring-all-front", sensitive: canBringAllToFront },
        { type: "separator" },
        { label: "Close", action: "close", sensitive: hasWindow },
    ];
}
