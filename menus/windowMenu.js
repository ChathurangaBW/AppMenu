export function buildWindowMenu() {
    return [
        { label: "Minimize", action: "minimize" },
        { label: "Maximize", action: "maximize" },
        { type: "separator" },
        { label: "Tile Left", action: "tile-left" },
        { label: "Tile Right", action: "tile-right" },
        { type: "separator" },
        { label: "Previous Workspace", action: "workspace-prev" },
        { label: "Next Workspace", action: "workspace-next" },
        { label: "Move Window Left", action: "move-workspace-left" },
        { label: "Move Window Right", action: "move-workspace-right" },
        { type: "separator" },
        { label: "Bring All to Front", action: "bring-all-front" },
        { type: "separator" },
        { label: "Close", action: "close" },
    ];
}
