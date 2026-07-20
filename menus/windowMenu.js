export function buildWindowMenu() {
    return [
        { label: "Minimize", action: "minimize" },
        { label: "Maximize", action: "maximize" },
        { type: "separator" },
        { label: "Tile Left", action: "tile-left" },
        { label: "Tile Right", action: "tile-right" },
        { type: "separator" },
        { label: "Bring All to Front", action: "bring-all-front" },
        { type: "separator" },
        { label: "Close", action: "close" },
    ];
}
