import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Logger from './logger.js';
import { _ } from './i18n.js';

// dbusmenu is optional. Fedora minimal installations and GTK-action-only apps
// must still be able to load AppMenu without the typelib installed.
let Dbusmenu = null;
try {
    const GIRepository = imports.gi.GIRepository;
    GIRepository.Repository.dup_default().require('Dbusmenu', '0.4', 0);
    Dbusmenu = imports.gi.Dbusmenu;
} catch (_e) {
    Logger.debug('Dbusmenu typelib unavailable; using GTK actions and fallback menus.');
}

const REGISTRAR_BUS_NAME = 'com.canonical.AppMenu.Registrar';
const REGISTRAR_OBJECT_PATH = '/com/canonical/AppMenu/Registrar';
const REGISTRAR_INTERFACE = 'com.canonical.AppMenu.Registrar';
const GTK_ACTIONS_INTERFACE = 'org.gtk.Actions';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

// ── well-known action → human label ──────────────────────────────────────
const KNOWN_LABELS = new Map([
    // App menu
    ['about', 'About'],
    ['preferences', 'Settings'],
    ['options', 'Settings'],
    ['quit', 'Quit'],
    ['exit', 'Quit'],
    ['close', 'Close'],
    ['help', 'Help'],
    ['keyboard-shortcuts', 'Keyboard Shortcuts'],
    ['shortcuts', 'Keyboard Shortcuts'],
    ['make-default', 'Make Default'],
    ['show-diagnostics', 'Diagnostics'],

    // File menu
    ['new-window', 'New Window'],
    ['clone-window', 'New Window'],
    ['tepl-new-window', 'New Window'],
    ['new-tab', 'New Tab'],
    ['new-document', 'New Document'],
    ['open', 'Open…'],
    ['open-document', 'Open…'],
    ['open-recent', 'Open Recent'],
    ['save', 'Save'],
    ['save-as', 'Save As…'],
    ['save-copy', 'Save a Copy…'],
    ['save-all', 'Save All'],
    ['revert', 'Revert'],
    ['print', 'Print…'],
    ['print-preview', 'Print Preview'],
    ['page-setup', 'Page Setup…'],
    ['export', 'Export…'],
    ['export-as', 'Export As…'],
    ['import', 'Import…'],
    ['send-to', 'Send To…'],
    ['share', 'Share…'],
    ['close-tab', 'Close Tab'],
    ['close-window', 'Close Window'],
    ['close-all', 'Close All'],
    ['show-file-transfers', 'File Transfers'],
    ['search-settings', 'Search Settings'],
    ['properties', 'Properties'],

    // Edit menu
    ['undo', 'Undo'],
    ['redo', 'Redo'],
    ['cut', 'Cut'],
    ['copy', 'Copy'],
    ['paste', 'Paste'],
    ['paste-special', 'Paste Special'],
    ['delete', 'Delete'],
    ['select-all', 'Select All'],
    ['deselect', 'Deselect'],
    ['find', 'Find…'],
    ['find-replace', 'Find and Replace…'],
    ['find-next', 'Find Next'],
    ['find-previous', 'Find Previous'],
    ['replace', 'Replace…'],
    ['go-to-line', 'Go to Line…'],
    ['go-to', 'Go To…'],
    ['clear-history', 'Clear History'],
    ['remove-recent', 'Clear Recent'],
    ['insert-emoji', 'Emoji & Symbols'],
    ['insert-symbol', 'Insert Symbol'],

    // View menu
    ['zoom-in', 'Zoom In'],
    ['zoom-out', 'Zoom Out'],
    ['zoom-default', 'Actual Size'],
    ['zoom-normal', 'Actual Size'],
    ['zoom-reset', 'Actual Size'],
    ['fullscreen', 'Full Screen'],
    ['toggle-fullscreen', 'Full Screen'],
    ['reload', 'Reload'],
    ['refresh', 'Refresh'],
    ['show-menubar', 'Show Menu Bar'],
    ['show-toolbar', 'Show Toolbar'],
    ['show-statusbar', 'Show Status Bar'],
    ['show-sidebar', 'Show Sidebar'],
    ['show-side-panel', 'Show Side Panel'],
    ['show-tabs', 'Show Tabs'],
    ['show-hidden-files', 'Show Hidden Files'],
    ['show-details', 'Show Details'],
    ['show-grid', 'Show as Grid'],
    ['show-list', 'Show as List'],
    ['sort-ascending', 'Sort Ascending'],
    ['sort-descending', 'Sort Descending'],
    ['sort-by-name', 'Sort by Name'],
    ['sort-by-date', 'Sort by Date'],
    ['sort-by-size', 'Sort by Size'],
    ['sort-by-type', 'Sort by Type'],
    ['filter', 'Filter…'],
    ['style-scheme', 'Color Scheme'],

    // Format / Text
    ['bold', 'Bold'],
    ['italic', 'Italic'],
    ['underline', 'Underline'],
    ['strikethrough', 'Strikethrough'],
    ['font', 'Font…'],
    ['text-direction', 'Text Direction'],
    ['align-left', 'Align Left'],
    ['align-center', 'Align Center'],
    ['align-right', 'Align Right'],
    ['align-justify', 'Justify'],
    ['indent', 'Indent'],
    ['unindent', 'Unindent'],
    ['increase-indent', 'Increase Indent'],
    ['decrease-indent', 'Decrease Indent'],
    ['bullet-list', 'Bullet List'],
    ['numbered-list', 'Numbered List'],
    ['toggle-list', 'Toggle List'],

    // Tools
    ['spell-check', 'Spell Check'],
    ['check-spelling', 'Spell Check'],
    ['word-count', 'Word Count'],
    ['document-statistics', 'Document Statistics'],
    ['highlight-mode', 'Highlight Mode'],
    ['comment', 'Comment'],
]);

// ── action category matchers ─────────────────────────────────────────────
function _categoryForAction(name) {
    const n = name.toLowerCase();

    // App menu actions — exclude help/about (those go to Help menu)
    if (/^(preferences|options|quit|exit|close$|make-default|show-diagnostics|diagnostics)$/.test(n))
        return 'app';

    // File actions — prefix-based
    if (/^(new-|clone-|tepl-|open|save|print|export|import|revert|send-|share|close-tab|close-window|close-all|page-setup|show-file|search-settings|properties)/.test(n))
        return 'file';

    // Edit actions
    if (/^(undo|redo|cut|copy|paste|delete|select-all|deselect|find|replace|go-to|clear-history|remove-recent|insert-)/.test(n))
        return 'edit';

    // View actions
    if (/^(zoom-|fullscreen|toggle-fullscreen|reload|refresh|show-|sort-|filter|style-scheme)/.test(n))
        return 'view';

    // Format actions
    if (/^(bold|italic|underline|strikethrough|font|text-direction|align-|indent|unindent|increase-indent|decrease-indent|bullet-|numbered-|toggle-list)/.test(n))
        return 'format';

    // Tools
    if (/^(spell|check-spelling|word-count|document-statistics|highlight-|comment)/.test(n))
        return 'tools';

    // Help (only when not already in app menu)
    if (/^(help|about|shortcuts|keyboard-shortcuts)/.test(n))
        return 'help';

    return 'other';
}

// ── label helpers ─────────────────────────────────────────────────────────
function _labelForAction(name) {
    const known = KNOWN_LABELS.get(name);
    if (known)
        return _(known);
    return _humanizeActionName(name);
}

function _humanizeActionName(name) {
    return String(name ?? '')
        .replace(/_/g, ' ')
        .split(/[-.]/g)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

// ── dbusmenu helpers ──────────────────────────────────────────────────────
function _normalizeLabel(label) {
    return String(label ?? '')
        .replace(/_/g, '')
        .replace(/\.\.\.$/g, '…')
        .replace(/\s+/g, ' ')
        .trim();
}

function _isVisible(item) {
    return !item.property_exist(Dbusmenu.MENUITEM_PROP_VISIBLE)
        || item.property_get_bool(Dbusmenu.MENUITEM_PROP_VISIBLE);
}

function _unpackGtkActionDetails(details) {
    if (Array.isArray(details)) {
        return {
            enabled: Boolean(details[0]),
            parameterType: String(details[1] ?? ''),
            state: details[2],
        };
    }

    return {
        enabled: details?.enabled !== false,
        parameterType: String(details?.['parameter-type'] ?? ''),
        state: details?.state,
    };
}

function _isEnabled(item) {
    return !item.property_exist(Dbusmenu.MENUITEM_PROP_ENABLED)
        || item.property_get_bool(Dbusmenu.MENUITEM_PROP_ENABLED);
}

function _isSeparator(item) {
    return item.property_exist(Dbusmenu.MENUITEM_PROP_TYPE)
        && item.property_get(Dbusmenu.MENUITEM_PROP_TYPE) === Dbusmenu.CLIENT_TYPES_SEPARATOR;
}

function _getOrnament(item) {
    if (!item.property_exist(Dbusmenu.MENUITEM_PROP_TOGGLE_TYPE))
        return 'none';

    const toggleType = item.property_get(Dbusmenu.MENUITEM_PROP_TOGGLE_TYPE);
    const toggleState = item.property_exist(Dbusmenu.MENUITEM_PROP_TOGGLE_STATE)
        ? item.property_get_int(Dbusmenu.MENUITEM_PROP_TOGGLE_STATE)
        : Dbusmenu.MENUITEM_TOGGLE_STATE_UNKNOWN;

    if (toggleState !== Dbusmenu.MENUITEM_TOGGLE_STATE_CHECKED)
        return 'none';

    if (toggleType === Dbusmenu.MENUITEM_TOGGLE_RADIO)
        return 'dot';
    if (toggleType === Dbusmenu.MENUITEM_TOGGLE_CHECK)
        return 'check';
    return 'none';
}

// ── GTK action state → ornament ──────────────────────────────────────────
function _gtkActionOrnament(action) {
    // GTK action state: a GLib.Variant with the current state value.
    // Boolean true  → check ornament,  a string → radio ornament.
    if (action.state === undefined || action.state === null)
        return 'none';

    const typeString = action.state.get_type_string?.() ?? '';
    if (typeString === 'b') {
        return action.state.get_boolean() ? 'check' : 'none';
    }
    if (typeString === 's') {
        // radio-like: state is a string (e.g. the selected style scheme)
        return 'dot';
    }
    return 'none';
}

function _isAppMenuLabel(label, appName) {
    const normalized = _normalizeLabel(label).toLowerCase();
    const normalizedAppName = _normalizeLabel(appName).toLowerCase();
    if (!normalized)
        return false;

    return normalized === normalizedAppName
        || normalized === 'application'
        || normalized === 'app'
        || normalized === 'menu';
}

function _desktopIdToBusName(appId) {
    if (!appId)
        return null;

    const normalized = String(appId).replace(/\.desktop$/i, '').trim();
    return normalized.length > 0 ? normalized : null;
}

function _busNameToObjectPath(busName) {
    if (!busName)
        return null;
    return `/${busName.replace(/\./g, '/')}`;
}

// Probe only an already-owned application bus. Activating an app just to
// inspect its menu is surprising, and synchronous probes freeze GNOME Shell.
async function _probeGtkActions(busName, objectPath, cancellable) {
    try {
        const result = await Gio.DBus.session.call(
            busName, objectPath,
            GTK_ACTIONS_INTERFACE, 'DescribeAll',
            null, null, Gio.DBusCallFlags.NONE, 2000, cancellable
        );
        const [descriptions] = result.deepUnpack();
        if (!descriptions || Object.keys(descriptions).length === 0)
            return null;
        return Object.entries(descriptions)
            .map(([name, details]) => ({name, objectPath, ..._unpackGtkActionDetails(details)}))
            .filter(a => a.parameterType === '');
    } catch (_e) {
        return null;
    }
}

// ── RealMenuManager ──────────────────────────────────────────────────────
export class RealMenuManager {
    constructor(settings, onChanged) {
        this._settings = settings;
        this._onChanged = onChanged;
        this._client = null;
        this._clientSignalIds = [];
        this._currentKey = null;
        this._currentRegistration = null;
        this._currentAppName = '';
        this._backendType = null;
        this._currentGtkContext = null;
        this._cachedActions = null;
        this._cachedWinActions = null;
        this._currentWindow = null;
        this._requestGeneration = 0;
        this._requestCancellable = null;
        this._registrarFailed = false;
        this._isWayland = (GLib.getenv('XDG_SESSION_TYPE') ?? '').toLowerCase() === 'wayland';
    }

    get enabled() {
        try {
            return this._settings?.get_boolean('use-real-menus') ?? true;
        } catch (_e) {
            return true;
        }
    }

    invalidate() {
        this._cancelRequest();
        this._currentWindow = null;
        this._cachedActions = null;
        this._cachedWinActions = null;
        this._registrarFailed = false;
        this._setBackend(null, null);
    }

    destroy() {
        this._cancelRequest();
        this._currentWindow = null;
        this._cachedActions = null;
        this._cachedWinActions = null;
        this._registrarFailed = false;
        this._setBackend(null, null);
        this._settings = null;
        this._onChanged = null;
    }

    updateForWindow(window, appName = '', detectedApp = null, wmClass = '') {
        this._currentAppName = appName;

        if (!this.enabled || !window) {
            this._cancelRequest();
            this._currentWindow = null;
            this._cachedActions = null;
            this._setBackend(null, null);
            return null;
        }

        if (window !== this._currentWindow)
            this._startLookup(window, detectedApp, wmClass);
        return this.buildCurrentMenuModel(appName);
    }

    _cancelRequest() {
        this._requestGeneration++;
        this._requestCancellable?.cancel();
        this._requestCancellable = null;
    }

    _isCurrentRequest(generation, window) {
        return !this._requestCancellable?.is_cancelled()
            && generation === this._requestGeneration
            && window === this._currentWindow;
    }

    _startLookup(window, detectedApp, wmClass) {
        this._cancelRequest();
        this._currentWindow = window;
        this._cachedActions = null;
        this._cachedWinActions = null;
        this._setBackend(null, null);

        const generation = this._requestGeneration;
        this._requestCancellable = new Gio.Cancellable();
        const cancellable = this._requestCancellable;

        if (!this._registrarFailed)
            this._requestRegistration(window, generation, cancellable);
        this._requestGtkActions(detectedApp, wmClass, generation, cancellable);
    }

    async _requestRegistration(window, generation, cancellable) {
        if (!Dbusmenu)
            return;

        let windowId = 0;
        try {
            windowId = window?.get_id?.() ?? 0;
        } catch (_e) {
            return;
        }
        if (!windowId)
            return;

        try {
            const result = await Gio.DBus.session.call(
                REGISTRAR_BUS_NAME, REGISTRAR_OBJECT_PATH, REGISTRAR_INTERFACE,
                'GetMenuForWindow', new GLib.Variant('(u)', [windowId]),
                new GLib.VariantType('(so)'), Gio.DBusCallFlags.NONE, 1000, cancellable
            );
            if (!this._isCurrentRequest(generation, window))
                return;

            const [service, path] = result.deepUnpack();
            if (!service || !path || path === '/')
                return;

            this._setBackend('dbusmenu', { service, path });
            this._emitChanged();
        } catch (_e) {
            if (this._isWayland && this._isCurrentRequest(generation, window))
                this._registrarFailed = true;
        }
    }

    async _requestGtkActions(detectedApp, wmClass, generation, cancellable) {
        const appId = detectedApp?.get_id?.() ?? wmClass;
        const busName = _desktopIdToBusName(appId);
        const objectPath = _busNameToObjectPath(busName);
        if (!busName || !objectPath)
            return;

        const actions = await _probeGtkActions(busName, objectPath, cancellable);
        if (!actions || !this._isCurrentRequest(generation, this._currentWindow))
            return;
        if (this._backendType === 'dbusmenu')
            return;

        const context = { busName, objectPath, appId };
        this._setBackend('gtk-actions', context);
        this._cachedActions = actions;

        const winActions = await _probeGtkActions(busName, `${objectPath}/window/1`, cancellable);
        if (!this._isCurrentRequest(generation, this._currentWindow))
            return;
        if (this._backendType === 'dbusmenu')
            return;

        this._cachedWinActions = winActions;
        this._emitChanged();
    }

    buildCurrentMenuModel(appName = '') {
        if (this._backendType === 'dbusmenu')
            return this._buildDbusMenuModel(appName);
        if (this._backendType === 'gtk-actions')
            return this._buildGtkActionMenuModel();
        return null;
    }

    // ── dbusmenu (registrar) backend ──────────────────────────────────

    _buildDbusMenuModel(appName = '') {
        if (!this._client)
            return null;

        const root = this._client.get_root();
        if (!root)
            return null;

        const descriptors = root.get_children()
            .filter(item => _isVisible(item))
            .map(item => this._buildTopLevelDescriptor(item))
            .filter(Boolean);

        if (descriptors.length === 0)
            return null;

        let appMenuChildren = null;
        const topLevelMenus = [];

        for (const descriptor of descriptors) {
            if (!appMenuChildren && _isAppMenuLabel(descriptor.label, appName)) {
                appMenuChildren = descriptor.children;
                continue;
            }

            topLevelMenus.push({
                label: descriptor.label,
                children: descriptor.children,
                onOpen: descriptor.onOpen,
            });
        }

        return {
            registrationKey: this._currentKey,
            appMenuChildren,
            topLevelMenus,
        };
    }

    // ── GTK actions backend ───────────────────────────────────────────

    _buildGtkActionMenuModel() {
        if (!this._currentGtkContext)
            return null;

        const actions = this._cachedActions ?? [];
        if (actions.length === 0)
            return null;

        // Categorize every action
        const buckets = {
            app: [],
            file: [],
            edit: [],
            view: [],
            format: [],
            tools: [],
            help: [],
            other: [],
        };

        for (const action of actions) {
            const cat = _categoryForAction(action.name);
            buckets[cat].push(action);
        }

        // Build items from each bucket
        const build = (arr) => this._buildGtkActionItems(arr);

        const appItems = build(buckets.app);
        const fileItems = build(buckets.file);
        const editItems = build(buckets.edit);
        const viewItems = build(buckets.view);
        const formatItems = build(buckets.format);
        const toolsItems = build(buckets.tools);
        const helpItems = build(buckets.help);
        const otherItems = build(buckets.other);

        // Assemble app menu children: app-category items + any unrecognised + per-window actions
        const appChildren = [...appItems];
        if (otherItems.length > 0) {
            if (appChildren.length > 0)
                appChildren.push({ type: 'separator' });
            appChildren.push(...otherItems);
        }
        // Add per-window actions (e.g. "Read Only" tab toggle in Ptyxis)
        if (this._cachedWinActions && this._cachedWinActions.length > 0) {
            if (appChildren.length > 0)
                appChildren.push({ type: 'separator' });
            appChildren.push(...this._buildGtkActionItems(this._cachedWinActions));
        }

        // Assemble top-level menus
        const topLevelMenus = [];
        if (fileItems.length > 0) topLevelMenus.push({ label: 'File', children: fileItems });
        if (editItems.length > 0) topLevelMenus.push({ label: 'Edit', children: editItems });
        if (viewItems.length > 0) topLevelMenus.push({ label: 'View', children: viewItems });
        if (formatItems.length > 0) topLevelMenus.push({ label: 'Format', children: formatItems });
        if (toolsItems.length > 0) topLevelMenus.push({ label: 'Tools', children: toolsItems });
        if (helpItems.length > 0) topLevelMenus.push({ label: 'Help', children: helpItems });

        if (appChildren.length === 0 && topLevelMenus.length === 0)
            return null;

        Logger.debug(`gtk-actions: app=${appChildren.length} file=${fileItems.length} edit=${editItems.length} view=${viewItems.length} format=${formatItems.length} tools=${toolsItems.length} help=${helpItems.length} other=${otherItems.length}`);

        return {
            registrationKey: this._currentKey,
            appMenuChildren: appChildren.length > 0 ? appChildren : null,
            topLevelMenus,
        };
    }

    // ── backend lifecycle ──────────────────────────────────────────────

    _setBackend(kind, registration) {
        this._disposeCurrentBackend();

        this._backendType = kind;
        this._currentRegistration = registration;
        if (!kind || !registration) {
            this._currentKey = null;
            this._currentGtkContext = null;
            return;
        }

        if (kind === 'dbusmenu') {
            this._currentKey = `dbusmenu:${registration.service}|${registration.path}`;
            this._setDbusmenuClient(registration);
            return;
        }

        if (kind === 'gtk-actions') {
            this._currentKey = `gtk:${registration.busName}|${registration.objectPath}`;
            this._currentGtkContext = registration;
        }
    }

    _disposeCurrentBackend() {
        if (this._client) {
            this._clientSignalIds.forEach(id => {
                try { this._client.disconnect(id); } catch (_e) { /* ignore */ }
            });
            this._clientSignalIds = [];
            this._client = null;
        }
        this._currentGtkContext = null;
    }

    _setDbusmenuClient(registration) {
        try {
            this._client = new Dbusmenu.Client({
                dbus_name: registration.service,
                dbus_object: registration.path,
            });

            this._clientSignalIds = [
                this._client.connect(Dbusmenu.CLIENT_SIGNAL_ROOT_CHANGED, () => this._emitChanged()),
                this._client.connect(Dbusmenu.CLIENT_SIGNAL_LAYOUT_UPDATED, () => this._emitChanged()),
            ];
        } catch (e) {
            Logger.error(`Failed to create Dbusmenu client for ${registration.service}${registration.path}: ${e}`);
            this._client = null;
            this._backendType = null;
            this._currentRegistration = null;
            this._currentKey = null;
        }
    }

    // ── GTK action helpers ─────────────────────────────────────────────
    _buildGtkActionItems(actions) {
        return actions
            .map(action => this._buildGtkActionItem(action))
            .filter(Boolean);
    }

    _buildGtkActionItem(action) {
        if (!action)
            return null;

        const ornament = _gtkActionOrnament(action);

        return {
            label: _labelForAction(action.name),
            sensitive: action.enabled,
            ornament,
            activate: () => this._activateGtkAction(action.name, action.objectPath),
        };
    }

    async _activateGtkAction(name, objectPath = null) {
        if (!this._currentGtkContext)
            return;
        const context = this._currentGtkContext;
        try {
            await Gio.DBus.session.call(
                context.busName,
                objectPath ?? context.objectPath,
                GTK_ACTIONS_INTERFACE,
                'Activate',
                new GLib.Variant('(sav@a{sv})', [name, [], new GLib.Variant('a{sv}', {})]),
                null,
                Gio.DBusCallFlags.NONE,
                5000,
                null,
            );
        } catch (e) {
            Logger.error(`GTK action activation failed for ${name}: ${e}`);
        }
    }

    // ── signals ────────────────────────────────────────────────────────

    _emitChanged() {
        try {
            this._onChanged?.();
        } catch (e) {
            Logger.error(`Real menu change callback failed: ${e}`);
        }
    }

    // ── dbusmenu tree builders ─────────────────────────────────────────

    _buildTopLevelDescriptor(item) {
        if (!_isVisible(item))
            return null;

        const label = _normalizeLabel(item.property_get(Dbusmenu.MENUITEM_PROP_LABEL));
        if (!label)
            return null;

        return {
            label,
            children: this._buildChildren(item),
            onOpen: () => this._aboutToShow(item),
        };
    }

    _buildChildren(parentItem) {
        return parentItem.get_children()
            .filter(item => _isVisible(item))
            .map(item => this._buildMenuItem(item))
            .filter(Boolean);
    }

    _buildMenuItem(item) {
        if (!_isVisible(item))
            return null;

        if (_isSeparator(item))
            return { type: 'separator' };

        const label = _normalizeLabel(item.property_get(Dbusmenu.MENUITEM_PROP_LABEL));
        const children = this._buildChildren(item);
        const hasSubmenu = children.length > 0;

        if (!label && !hasSubmenu)
            return null;

        if (hasSubmenu) {
            return {
                type: 'submenu',
                label: label || _('More'),
                children,
                onOpen: () => this._aboutToShow(item),
            };
        }

        return {
            label: label || _('Untitled'),
            sensitive: _isEnabled(item),
            ornament: _getOrnament(item),
            activate: () => this._activateItem(item),
        };
    }

    _aboutToShow(item) {
        try {
            item.send_about_to_show();
        } catch (e) {
            Logger.debug(`Dbusmenu about-to-show failed: ${e}`);
        }
    }

    _activateItem(item) {
        try {
            item.handle_event(
                Dbusmenu.MENUITEM_EVENT_ACTIVATED,
                new GLib.Variant('i', 0),
                0,
            );
        } catch (e) {
            Logger.error(`Dbusmenu activation failed: ${e}`);
        }
    }
}
