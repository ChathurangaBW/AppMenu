import GLib from 'gi://GLib';


function _workspaceManager() {
    return global.workspace_manager;
}

function _activateWorkspaceByIndex(index) {
    const wm = _workspaceManager();
    if (!wm) return;
    const count = wm.get_n_workspaces();
    if (index < 0 || index >= count) return;
    const workspace = wm.get_workspace_by_index(index);
    workspace?.activate(global.get_current_time());
}

function _moveFocusedWindowByOffset(offset) {
    const win = global.display.get_focus_window();
    const wm = _workspaceManager();
    if (!win || !wm) return;
    const current = wm.get_active_workspace_index();
    const targetIndex = current + offset;
    const count = wm.get_n_workspaces();
    if (targetIndex < 0 || targetIndex >= count) return;
    const target = wm.get_workspace_by_index(targetIndex);
    if (!target) return;
    win.change_workspace(target);
    target.activate(global.get_current_time());
}

function _unminimizeAll() {
    const actors = global.get_window_actors();
    actors.forEach(a => {
        if (a.meta_window.is_minimized()) {
            a.meta_window.activate(global.get_current_time());
        }
    });
}

export const windowActions = {
    close: (ctx) => {
        if (ctx.window) ctx.window.delete(global.get_current_time());
    },

    minimize: (ctx) => {
        if (ctx.window) ctx.window.minimize();
    },

    maximize: (ctx) => {
        if (!ctx.window) return;
        if (ctx.window.is_maximized()) ctx.window.unmaximize();
        else ctx.window.maximize();
    },

    'activate-window': (ctx, winId) => {
        if (!ctx.app) return;
        const target = ctx.app.get_windows().find(w => w.get_id().toString() === winId);
        if (target) target.activate(global.get_current_time());
    },

    'new-app-window': (ctx) => {
        if (ctx.app) ctx.app.open_new_window(-1);
    },

    // Direct JS eval — runs inside GNOME Shell, no gdbus fork+exec
    'hide-app': () => {
        const actors = global.get_window_actors();
        actors.forEach(a => {
            if (a.meta_window.has_focus()) a.meta_window.minimize();
        });
    },

    'hide-others': () => {
        const actors = global.get_window_actors();
        actors.forEach(a => {
            if (!a.meta_window.has_focus() && !a.meta_window.is_skip_taskbar()) {
                a.meta_window.minimize();
            }
        });
    },

    // 'show-all' (app menu) and 'bring-all-front' (Window menu)
    // are the same operation, implemented via shared helper
    'show-all': _unminimizeAll,

    'tile-left': () => {
        const actors = global.get_window_actors();
        const focused = actors.find(a => a.meta_window.has_focus());
        if (!focused) return;
        const win = focused.meta_window;
        const monitorIndex = win.get_monitor();
        const workArea = global.display.get_monitor_work_area(monitorIndex);
        win.move_resize_frame(
            false,
            workArea.x, workArea.y,
            Math.floor(workArea.width / 2), workArea.height
        );
    },

    'tile-right': () => {
        const actors = global.get_window_actors();
        const focused = actors.find(a => a.meta_window.has_focus());
        if (!focused) return;
        const win = focused.meta_window;
        const monitorIndex = win.get_monitor();
        const workArea = global.display.get_monitor_work_area(monitorIndex);
        win.move_resize_frame(
            false,
            workArea.x + Math.floor(workArea.width / 2), workArea.y,
            Math.floor(workArea.width / 2), workArea.height
        );
    },

    'bring-all-front': _unminimizeAll,

    'workspace-next': () => {
        const wm = _workspaceManager();
        if (!wm) return;
        _activateWorkspaceByIndex(wm.get_active_workspace_index() + 1);
    },

    'workspace-prev': () => {
        const wm = _workspaceManager();
        if (!wm) return;
        _activateWorkspaceByIndex(wm.get_active_workspace_index() - 1);
    },

    'move-workspace-right': () => _moveFocusedWindowByOffset(1),

    'move-workspace-left': () => _moveFocusedWindowByOffset(-1),
};
