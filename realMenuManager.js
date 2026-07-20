import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Dbusmenu from 'gi://Dbusmenu?version=0.4';
import * as Logger from './logger.js';

const REGISTRAR_BUS_NAME = 'com.canonical.AppMenu.Registrar';
const REGISTRAR_OBJECT_PATH = '/com/canonical/AppMenu/Registrar';
const REGISTRAR_INTERFACE = 'com.canonical.AppMenu.Registrar';
const GTK_ACTIONS_INTERFACE = 'org.gtk.Actions';

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
        return known;
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

// Scan the session bus for a well-known name matching a wmClass pattern.
// wmClass is usually like "gnome-terminal-server" or "gedit" — we try
// to match it against well-known names like "org.gnome.Ptyxis" etc.
function _findBusNameFromWmClass(wmClass) {
    if (!wmClass)
        return null;

    const lower = wmClass.toLowerCase();

    try {
        const result = Gio.DBus.session.call_sync(
            'org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'ListNames',
            null, null, Gio.DBusCallFlags.NONE, -1, null
        );
        const names = result.deepUnpack()[0];

        // Try exact match first: eg "org.gnome.gedit" for wmClass "gedit"
        for (const name of names) {
            if (name.startsWith(':') || name.startsWith('org.freedesktop') ||
                name.startsWith('org.gtk.vfs') || name.startsWith('org.a11y') ||
                name.startsWith('org.gnome.Mutter') || name.startsWith('org.gnome.Settings') ||
                name.startsWith('org.gnome.Shell') || name.startsWith('org.gnome.Session') ||
                name.startsWith('org.pulseaudio') || name.startsWith('ca.desrt'))
                continue;
            const nameLower = name.toLowerCase();
            // Match if the last component of the bus name equals wmClass
            const lastDot = nameLower.lastIndexOf('.');
            const lastPart = lastDot >= 0 ? nameLower.substring(lastDot + 1) : nameLower;
            if (lastPart === lower || lastPart.replace(/-/g, '') === lower.replace(/-/g, ''))
                return name;
        }

        // Fuzzy match: wmClass appears as a substring in the bus name
        for (const name of names) {
            if (name.startsWith(':') || name.startsWith('org.freedesktop')) continue;
            if (name.toLowerCase().includes(lower))
                return name;
        }

    } catch (_e) {
        // ignore
    }

    return null;
}

// Try to bring an app's D-Bus service online via org.freedesktop.Application.Activate
// so we can then query org.gtk.Actions. This works for GTK apps that use
// GApplication's D-Bus activation but don't keep their bus name active.
function _activateAppBus(busName, objectPath) {
    try {
        Gio.DBus.session.call_sync(
            busName, objectPath,
            'org.freedesktop.Application', 'Activate',
            new GLib.Variant('(a{sv})', [{}]),
            null, Gio.DBusCallFlags.NONE, 2000, null
        );
        return true;
    } catch (_e) {
        return false;
    }
}

// Probe an object path for org.gtk.Actions, with optional D-Bus activation.
// Returns array of action objects or null.
function _probeGtkActions(busName, objectPath, activate = false) {
    try {
        const result = Gio.DBus.session.call_sync(
            busName, objectPath,
            GTK_ACTIONS_INTERFACE, 'DescribeAll',
            null, null, Gio.DBusCallFlags.NONE, activate ? 5000 : -1, null
        );
        const [descriptions] = result.deepUnpack();
        if (!descriptions || Object.keys(descriptions).length === 0)
            return null;
        return Object.entries(descriptions)
            .map(([name, details]) => ({
                name, enabled: Boolean(details[0]),
                parameterType: String(details[1] ?? ''), state: details[2],
            }))
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
        this._lastWmClass = null;
        this._registrarFailed = false;
    }

    get enabled() {
        try {
            return this._settings?.get_boolean('use-real-menus') ?? true;
        } catch (_e) {
            return true;
        }
    }

    invalidate() {
        this._cachedActions = null;
        this._cachedWinActions = null;
        this._lastWmClass = null;
        this._registrarFailed = false;
        this._setBackend(null, null);
    }

    destroy() {
        this._cachedActions = null;
        this._cachedWinActions = null;
        this._lastWmClass = null;
        this._registrarFailed = false;
        this._setBackend(null, null);
        this._settings = null;
        this._onChanged = null;
    }

    updateForWindow(window, appName = '', detectedApp = null, wmClass = '') {
        this._currentAppName = appName;

        if (!this.enabled || !window) {
            this._cachedActions = null;
            this._setBackend(null, null);
            return null;
        }

        // 1) Registrar — only try once. If it fails (always on Wayland), never retry.
        if (!this._registrarFailed) {
            const registration = this._lookupRegistration(window);
            if (registration) {
                const key = `dbusmenu:${registration.service}|${registration.path}`;
                this._cachedActions = null;
                if (key !== this._currentKey)
                    this._setBackend('dbusmenu', registration);
                return this.buildCurrentMenuModel(appName);
            }
            this._registrarFailed = true;
        }

        // 2) GTK actions — cached per wmClass, no D-Bus rescan on every focus
        if (wmClass && wmClass === this._lastWmClass && this._currentGtkContext) {
            return this.buildCurrentMenuModel(appName);
        }
        this._lastWmClass = wmClass;

        let gtkContext = this._lookupGtkAppContext(detectedApp);
        if (!gtkContext && wmClass) {
            gtkContext = this._lookupGtkAppContext({ get_id: () => wmClass });
            if (!gtkContext) {
                const busName = _findBusNameFromWmClass(wmClass);
                if (busName) {
                    const objectPath = _busNameToObjectPath(busName);
                    gtkContext = { busName, objectPath, appId: wmClass };
                }
            }
            if (!gtkContext) {
                const candidateBus = _desktopIdToBusName(wmClass);
                if (candidateBus) {
                    const candidatePath = _busNameToObjectPath(candidateBus);
                    _activateAppBus(candidateBus, candidatePath);
                    const actions = _probeGtkActions(candidateBus, candidatePath);
                    if (actions && actions.length > 0) {
                        gtkContext = { busName: candidateBus, objectPath: candidatePath, appId: wmClass };
                    }
                }
            }
        }
        if (!gtkContext) {
            this._cachedActions = null;
            this._setBackend(null, null);
            return null;
        }

        // 3) Probe for per-window actions (e.g. tab.read-only in Ptyxis)
        let winActions = null;
        if (gtkContext.busName) {
            const winObjPath = `${gtkContext.objectPath}/window/1`;
            winActions = _probeGtkActions(gtkContext.busName, winObjPath);
        }

        const key = `gtk:${gtkContext.busName}|${gtkContext.objectPath}`;
        if (key !== this._currentKey) {
            this._cachedActions = null;
            this._setBackend('gtk-actions', gtkContext);
        }

        this._cachedWinActions = winActions;

        return this.buildCurrentMenuModel(appName);
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

        const actions = this._fetchGtkActions(this._currentGtkContext);
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

    // ── D-Bus lookups ──────────────────────────────────────────────────

    _lookupRegistration(window) {
        let windowId = 0;
        try {
            windowId = window?.get_id?.() ?? 0;
        } catch (_e) {
            return null;
        }

        if (!windowId)
            return null;

        try {
            const result = Gio.DBus.session.call_sync(
                REGISTRAR_BUS_NAME,
                REGISTRAR_OBJECT_PATH,
                REGISTRAR_INTERFACE,
                'GetMenuForWindow',
                new GLib.Variant('(u)', [windowId]),
                new GLib.VariantType('(so)'),
                Gio.DBusCallFlags.NONE,
                1000,  // 1s timeout — don't block the shell
                null,
            );

            const [service, path] = result.deepUnpack();
            if (!service || !path || path === '/')
                return null;

            return { service, path };
        } catch (e) {
            return null;
        }
    }

    _lookupGtkAppContext(detectedApp) {
        const appId = detectedApp?.get_id?.();
        const busName = _desktopIdToBusName(appId);
        if (!busName)
            return null;

        const objectPath = _busNameToObjectPath(busName);
        if (!objectPath)
            return null;

        try {
            const result = Gio.DBus.session.call_sync(
                busName,
                objectPath,
                GTK_ACTIONS_INTERFACE,
                'DescribeAll',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
            const [descriptions] = result.deepUnpack();
            if (!descriptions || Object.keys(descriptions).length === 0)
                return null;
        } catch (e) {
            Logger.debug(`No GTK actions for ${busName}${objectPath}: ${e}`);
            return null;
        }

        return { busName, objectPath, appId };
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
            this._client.run_dispose();
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

    _fetchGtkActions(context) {
        try {
            const result = Gio.DBus.session.call_sync(
                context.busName,
                context.objectPath,
                GTK_ACTIONS_INTERFACE,
                'DescribeAll',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
            const [descriptions] = result.deepUnpack();
            return Object.entries(descriptions)
                .map(([name, details]) => ({
                    name,
                    enabled: Boolean(details[0]),
                    parameterType: String(details[1] ?? ''),
                    state: details[2],
                }))
                .filter(action => action.parameterType === '');
        } catch (e) {
            Logger.error(`Failed to fetch GTK actions for ${context.busName}${context.objectPath}: ${e}`);
            return [];
        }
    }

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
            activate: () => this._activateGtkAction(action.name),
        };
    }

    _activateGtkAction(name) {
        if (!this._currentGtkContext)
            return;
        try {
            Gio.DBus.session.call_sync(
                this._currentGtkContext.busName,
                this._currentGtkContext.objectPath,
                GTK_ACTIONS_INTERFACE,
                'Activate',
                new GLib.Variant('(sav@a{sv})', [name, [], new GLib.Variant('a{sv}', {})]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
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
                label: label || 'More',
                children,
                onOpen: () => this._aboutToShow(item),
            };
        }

        return {
            label: label || 'Untitled',
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
