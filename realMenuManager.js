import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Dbusmenu from 'gi://Dbusmenu?version=0.4';
import * as Logger from './logger.js';

const REGISTRAR_BUS_NAME = 'com.canonical.AppMenu.Registrar';
const REGISTRAR_OBJECT_PATH = '/com/canonical/AppMenu/Registrar';
const REGISTRAR_INTERFACE = 'com.canonical.AppMenu.Registrar';
const GTK_ACTIONS_INTERFACE = 'org.gtk.Actions';

const ACTION_LABELS = new Map([
    ['about', 'About'],
    ['preferences', 'Settings'],
    ['quit', 'Quit'],
    ['help', 'Help'],
    ['shortcuts', 'Keyboard Shortcuts'],
    ['new-window', 'New Window'],
    ['clone-window', 'New Window'],
    ['tepl-new-window', 'New Window'],
    ['new-tab', 'New Tab'],
    ['new-document', 'New Document'],
    ['show-file-transfers', 'File Transfers'],
    ['search-settings', 'Search Settings'],
    ['make-default', 'Make Default'],
]);

const APP_MENU_ACTIONS = new Set([
    'about',
    'preferences',
    'quit',
    'help',
    'shortcuts',
    'make-default',
]);

const FILE_MENU_ACTIONS = new Set([
    'new-window',
    'clone-window',
    'tepl-new-window',
    'new-tab',
    'new-document',
    'show-file-transfers',
    'search-settings',
]);

const HELP_MENU_ACTIONS = new Set([
    'help',
    'shortcuts',
    'about',
]);

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

function _humanizeActionName(name) {
    return String(name ?? '')
        .split(/[-_.]/g)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

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
    }

    get enabled() {
        try {
            return this._settings?.get_boolean('use-real-menus') ?? true;
        } catch (_e) {
            return true;
        }
    }

    invalidate() {
        this._setBackend(null, null);
    }

    destroy() {
        this._setBackend(null, null);
        this._settings = null;
        this._onChanged = null;
    }

    updateForWindow(window, appName = '', detectedApp = null) {
        this._currentAppName = appName;

        if (!this.enabled || !window) {
            this._setBackend(null, null);
            return null;
        }

        const registration = this._lookupRegistration(window);
        if (registration) {
            const key = `dbusmenu:${registration.service}|${registration.path}`;
            if (key !== this._currentKey)
                this._setBackend('dbusmenu', registration);
            return this.buildCurrentMenuModel(appName);
        }

        const gtkContext = this._lookupGtkAppContext(detectedApp);
        if (!gtkContext) {
            this._setBackend(null, null);
            return null;
        }

        const key = `gtk:${gtkContext.busName}|${gtkContext.objectPath}`;
        if (key !== this._currentKey)
            this._setBackend('gtk-actions', gtkContext);

        return this.buildCurrentMenuModel(appName);
    }

    buildCurrentMenuModel(appName = '') {
        if (this._backendType === 'dbusmenu')
            return this._buildDbusMenuModel(appName);
        if (this._backendType === 'gtk-actions')
            return this._buildGtkActionMenuModel();
        return null;
    }

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

    _buildGtkActionMenuModel() {
        if (!this._currentGtkContext)
            return null;

        const actions = this._fetchGtkActions(this._currentGtkContext);
        if (actions.length === 0)
            return null;

        const appMenuChildren = this._buildGtkActionItems(actions.filter(action => APP_MENU_ACTIONS.has(action.name)));
        const fileChildren = this._buildGtkActionItems(actions.filter(action => FILE_MENU_ACTIONS.has(action.name)));
        const helpChildren = this._buildGtkActionItems(actions.filter(action => HELP_MENU_ACTIONS.has(action.name) && !APP_MENU_ACTIONS.has(action.name)));
        const remaining = actions.filter(action =>
            !APP_MENU_ACTIONS.has(action.name)
            && !FILE_MENU_ACTIONS.has(action.name)
            && !HELP_MENU_ACTIONS.has(action.name)
        );

        const appChildren = [...appMenuChildren];
        if (remaining.length > 0) {
            if (appChildren.length > 0)
                appChildren.push({ type: 'separator' });
            appChildren.push(...this._buildGtkActionItems(remaining));
        }

        const topLevelMenus = [];
        if (fileChildren.length > 0)
            topLevelMenus.push({ label: 'File', children: fileChildren });
        if (helpChildren.length > 0)
            topLevelMenus.push({ label: 'Help', children: helpChildren });

        if (appChildren.length === 0 && topLevelMenus.length === 0)
            return null;

        return {
            registrationKey: this._currentKey,
            appMenuChildren: appChildren.length > 0 ? appChildren : null,
            topLevelMenus,
        };
    }

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
                -1,
                null,
            );

            const [service, path] = result.deepUnpack();
            if (!service || !path || path === '/')
                return null;

            return { service, path };
        } catch (e) {
            Logger.debug(`No exported menu for window ${windowId}: ${e}`);
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

        return {
            label: ACTION_LABELS.get(action.name) ?? _humanizeActionName(action.name),
            sensitive: action.enabled,
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

    _emitChanged() {
        try {
            this._onChanged?.();
        } catch (e) {
            Logger.error(`Real menu change callback failed: ${e}`);
        }
    }

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
