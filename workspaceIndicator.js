import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const INDICATOR_NAME = 'AppMenuWorkspaceIndicator';

const WorkspaceIndicatorButton = GObject.registerClass(
class WorkspaceIndicatorButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'AppMenu Workspace Indicator');
        this.add_style_class_name('appmenu-workspace-indicator-button');
        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'appmenu-workspace-indicator-label',
        });
        this.add_child(this._label);
    }

    update(activeIndex, count) {
        const safeCount = Math.max(1, count);
        const dots = [];
        for (let i = 0; i < safeCount; i++)
            dots.push(i === activeIndex ? '●' : '○');
        this._label.set_text(dots.join(' '));
    }
});

export class WorkspaceIndicatorController {
    constructor(settings) {
        this._settings = settings;
        this._indicator = null;
        this._workspaceManager = global.workspace_manager;
        this._signals = [];
        this._settingsSignals = [];

        this._connect();
        this._syncVisibility();
    }

    destroy() {
        this._disconnect();
        this._destroyIndicator();
        this._settings = null;
        this._workspaceManager = null;
    }

    _connect() {
        if (this._workspaceManager) {
            this._signals = [
                this._workspaceManager.connect('active-workspace-changed', () => this._update()),
                this._workspaceManager.connect('notify::n-workspaces', () => this._update()),
            ];
        }

        if (this._settings) {
            this._settingsSignals = [
                this._settings.connect('changed::show-workspace-indicator', () => this._syncVisibility()),
                this._settings.connect('changed::workspace-indicator-position', () => this._recreateIndicator()),
            ];
        }
    }

    _disconnect() {
        if (this._workspaceManager) {
            for (const id of this._signals)
                this._workspaceManager.disconnect(id);
        }
        this._signals = [];

        if (this._settings) {
            for (const id of this._settingsSignals)
                this._settings.disconnect(id);
        }
        this._settingsSignals = [];
    }

    _enabled() {
        try {
            return this._settings?.get_boolean('show-workspace-indicator') ?? false;
        } catch (_e) {
            return false;
        }
    }

    _position() {
        try {
            return this._settings?.get_string('workspace-indicator-position') || 'right';
        } catch (_e) {
            return 'right';
        }
    }

    _syncVisibility() {
        if (this._enabled())
            this._ensureIndicator();
        else
            this._destroyIndicator();
    }

    _recreateIndicator() {
        const wasEnabled = this._indicator !== null;
        this._destroyIndicator();
        if (wasEnabled && this._enabled())
            this._ensureIndicator();
    }

    _ensureIndicator() {
        if (this._indicator)
            return;

        this._indicator = new WorkspaceIndicatorButton();
        const position = this._position() === 'left' ? 'left' : 'right';
        Main.panel.addToStatusArea(INDICATOR_NAME, this._indicator, 2, position);
        this._update();
    }

    _destroyIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _update() {
        if (!this._indicator || !this._workspaceManager)
            return;

        const active = this._workspaceManager.get_active_workspace_index();
        const count = this._workspaceManager.get_n_workspaces();
        this._indicator.update(active, count);
    }
}
