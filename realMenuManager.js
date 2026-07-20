import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Dbusmenu from 'gi://Dbusmenu?version=0.4';
import * as Logger from './logger.js';

const REGISTRAR_BUS_NAME = 'com.canonical.AppMenu.Registrar';
const REGISTRAR_OBJECT_PATH = '/com/canonical/AppMenu/Registrar';
const REGISTRAR_INTERFACE = 'com.canonical.AppMenu.Registrar';

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

export class RealMenuManager {
    constructor(settings, onChanged) {
        this._settings = settings;
        this._onChanged = onChanged;
        this._client = null;
        this._clientSignalIds = [];
        this._currentKey = null;
        this._currentRegistration = null;
        this._currentAppName = '';
    }

    get enabled() {
        try {
            return this._settings?.get_boolean('use-real-menus') ?? true;
        } catch (_e) {
            return true;
        }
    }

    invalidate() {
        this._setClient(null);
    }

    destroy() {
        this._setClient(null);
        this._settings = null;
        this._onChanged = null;
    }

    updateForWindow(window, appName = '') {
        this._currentAppName = appName;

        if (!this.enabled || !window) {
            this._setClient(null);
            return null;
        }

        const registration = this._lookupRegistration(window);
        if (!registration) {
            this._setClient(null);
            return null;
        }

        const key = `${registration.service}|${registration.path}`;
        if (key !== this._currentKey)
            this._setClient(registration);

        return this.buildCurrentMenuModel(appName);
    }

    buildCurrentMenuModel(appName = '') {
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

    _setClient(registration) {
        if (this._client) {
            this._clientSignalIds.forEach(id => {
                try { this._client.disconnect(id); } catch (_e) { /* ignore */ }
            });
            this._clientSignalIds = [];
            this._client.run_dispose();
            this._client = null;
        }

        this._currentRegistration = registration;
        this._currentKey = registration ? `${registration.service}|${registration.path}` : null;
        if (!registration)
            return;

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
            this._currentRegistration = null;
            this._currentKey = null;
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
