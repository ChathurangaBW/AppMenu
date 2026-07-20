/*
 * recentItemsSubmenu.js - Recent files and applications submenu for the Apple menu.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {DocumentTooltip} from './documentTooltip.js';

// Limits for recent items per section
const FILES_RECENT_LIMIT = 12;
const APPLICATIONS_RECENT_LIMIT = 8;
const RECENT_ITEMS_FILE = GLib.build_filenamev([
  GLib.get_user_data_dir(),
  'recently-used.xbel',
]);
const APPLICATION_STATE_FILE = GLib.build_filenamev([
  GLib.get_user_data_dir(),
  'gnome-shell',
  'application_state',
]);
const CLEAR_APPLICATION_MENU = true;
const APPLICATION_SORT_MODE = 'usage'; // 'usage' or 'recent'
const HOVER_CLOSE_DELAY_MS = 200;
const RECENT_OPEN_DELAY_MS = 500;
const POINTER_TOLERANCE_PX = 8;

const PointerState = {
  INSIDE_RECENT: 0,
  INSIDE_SUBMENU: 1,
  BRIDGE: 2,
  OUTSIDE: 3,
};

Gio._promisify(Gio.File.prototype, 'load_bytes_async');

async function loadFileTextAsync(file, cancellable) {
  const [bytes] = await file.load_bytes_async(cancellable);
  return new TextDecoder().decode(bytes.get_data());
}

/**
 * A submenu item that shows recent files in a popup menu.
 * Manages hover state, timeouts, and pointer tracking for smooth UX.
 */
export const RecentItemsSubmenu = GObject.registerClass(
  { GTypeName: 'AppMenuRecentItemsSubmenu' },
  class RecentItemsSubmenu extends PopupMenu.PopupBaseMenuItem {
    _init(title, parentMenu, recentMenuManager) {
      super._init({
        reactive: true,
        can_focus: true,
        hover: true,
      });

      this._parentMenu = parentMenu;
      this._recentMenuManager = recentMenuManager ?? null;
      this._managerRegistered = false;

    // State tracking
    this._recentMenu = null;
    this._recentMenuHoverActor = null;
    this._recentMenuSignalIds = [];
    this._recentMenuMenuSignalIds = [];
    this._hoverCloseTimeoutId = 0;
    this._openDelayTimeoutId = 0;
    this._mainMenuCloseId = 0;
    this._submenuDestroyId = 0;
    this._chromeAdded = false;
    this._recentMenuClosing = false;
    this._mainMenuItemSignalIds = [];
    this._globalHoverMonitorId = 0;
    this._cancellable = new Gio.Cancellable();
    this._isDestroyed = false;

    // Build UI
    const label = new St.Label({
      text: title,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.add_child(label);

    const arrowIcon = new St.Icon({
      icon_name: 'go-next-symbolic',
      style_class: 'popup-menu-arrow',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.add_child(arrowIcon);

    // Connect events
    this._connectEvents();
  }

  _connectEvents() {
    this.actor.connect('enter-event', () => {
      this._cancelClose();
      this._setSubmenuHover(true);
      this._scheduleOpen();
      return Clutter.EVENT_PROPAGATE;
    });

    this.actor.connect('leave-event', () => {
      this._cancelOpenDelay();
      const submenuOpen = this._recentMenu && this._recentMenu.isOpen;
      if (submenuOpen) {
        this._setSubmenuHover(true);
      }
      this._scheduleClose();
      return Clutter.EVENT_PROPAGATE;
    });

    this.actor.connect('button-press-event', () => {
      this._cancelClose();
      this._cancelOpenDelay();
      this._ensureRecentMenuAndOpen().catch(logError);
      return Clutter.EVENT_STOP;
    });

    this.connect('activate', () => {
      this._cancelClose();
      this._cancelOpenDelay();
      this._ensureRecentMenuAndOpen().catch(logError);
    });
  }

  destroy() {
    this._isDestroyed = true;

    if (this._cancellable) {
      this._cancellable.cancel();
      this._cancellable = null;
    }

    // Clean up all timeouts before destroying
    this._cancelClose();
    this._cancelOpenDelay();
    this._stopGlobalHoverMonitor();
    this._closeAndDestroyRecentMenu();
    super.destroy();
  }

  _createSectionHeader(text) {
    const header = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      can_focus: false,
    });

    const label = new St.Label({
      text,
      style_class: 'popup-section-header-label',
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: true,
    });

    header.add_child(label);

    return header;
  }

  async _populateMenu(menu) {
    menu.removeAll();

    const recentItems = await this._getRecentItems();
    if (this._isDestroyed) return;

    const recentApplications = await this._getRecentApplications(APPLICATIONS_RECENT_LIMIT);
    if (this._isDestroyed) return;

    const files = [];
    for (const item of recentItems) {
      if (files.length >= FILES_RECENT_LIMIT) {
        break;
      }

      files.push(item);
    }

    const hasFiles = files.length > 0;
    const hasApplications = recentApplications.length > 0;

    if (!hasFiles && !hasApplications) {
      const placeholder = new PopupMenu.PopupMenuItem('No recent items');
      placeholder.setSensitive(false);
      menu.addMenuItem(placeholder);
      return;
    }

    let hasEntries = false;

    if (hasApplications) {
      if (hasEntries) {
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      }

      const applicationsHeader = this._createSectionHeader('Applications');
      menu.addMenuItem(applicationsHeader);

      recentApplications.forEach(({ title: appTitle, appInfo, gicon, desktopId }) => {
        const appMenuItem = this._createMenuItemWithIcon(
          appTitle,
          gicon,
          'application-x-executable-symbolic'
        );
        appMenuItem.connect('activate', () => this._launchRecentApplication(appInfo, desktopId));
        menu.addMenuItem(appMenuItem);
      });

      hasEntries = true;
    }

    if (hasFiles) {
      if (hasEntries) {
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      }

      const filesHeader = this._createSectionHeader('Documents');
      menu.addMenuItem(filesHeader);

      files.forEach(({ title: itemTitle, uri, isDirectory }) => {
        const icon = this._getRecentFileIcon(uri, isDirectory);
        const recentMenuItem = this._createMenuItemWithIcon(
          itemTitle,
          icon,
          isDirectory ? 'folder-symbolic' : 'text-x-generic-symbolic'
        );
        recentMenuItem.connect('activate', () => this._launchRecentUri(uri));
        this._attachDocumentTooltip(recentMenuItem, uri);
        menu.addMenuItem(recentMenuItem);
      });

      hasEntries = true;
    }

    if (hasEntries) {
      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      const clearItem = new PopupMenu.PopupMenuItem('Clear Menu');
      clearItem.connect('activate', () => this._clearRecentItems());
      menu.addMenuItem(clearItem);
    }
  }

  _clearRecentItems() {
    const file = Gio.File.new_for_path(RECENT_ITEMS_FILE);

    try {
      if (file.query_exists(null)) {
        file.delete(null);
      }
    } catch (error) {
      logError(error, 'Failed to clear recent items list');
    }

    if (CLEAR_APPLICATION_MENU) {
      this._clearApplicationUsage();
    }

    if (this._recentMenu) {
      this._populateMenu(this._recentMenu).catch(logError);
    }
  }

  _clearApplicationUsage() {
    const file = Gio.File.new_for_path(APPLICATION_STATE_FILE);

    try {
      if (file.query_exists(null)) {
        file.delete(null);
      }
    } catch (error) {
      logError(error, 'Failed to clear recent applications list');
    }
  }

  _cancelClose() {
    if (this._hoverCloseTimeoutId) {
      GLib.source_remove(this._hoverCloseTimeoutId);
      this._hoverCloseTimeoutId = 0;
    }
  }

  _cancelOpenDelay() {
    if (this._openDelayTimeoutId) {
      GLib.source_remove(this._openDelayTimeoutId);
      this._openDelayTimeoutId = 0;
    }
  }

  _startGlobalHoverMonitor() {
    if (this._globalHoverMonitorId !== 0) {
      return;
    }

    this._globalHoverMonitorId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      100,
      () => {
        if (!this._recentMenu || !this._recentMenu.isOpen) {
          this._globalHoverMonitorId = 0;
          return GLib.SOURCE_REMOVE;
        }

        const pointerState = this._getPointerState();
        if (
          pointerState === PointerState.INSIDE_RECENT ||
          pointerState === PointerState.INSIDE_SUBMENU ||
          pointerState === PointerState.BRIDGE
        ) {
          this._setSubmenuHover(true);
        }
        if (pointerState === PointerState.OUTSIDE) {
          this._closeAndDestroyRecentMenu();
          this._setSubmenuHover(false);
          this._globalHoverMonitorId = 0;
          return GLib.SOURCE_REMOVE;
        }

        return GLib.SOURCE_CONTINUE;
      }
    );
    GLib.Source.set_name_by_id(this._globalHoverMonitorId, 'AppMenuGlobalHoverMonitor');
  }

  _stopGlobalHoverMonitor() {
    if (this._globalHoverMonitorId !== 0) {
      GLib.source_remove(this._globalHoverMonitorId);
      this._globalHoverMonitorId = 0;
    }
  }

  _setSubmenuHover(shouldHover) {
    if (typeof this.setActive === 'function') {
      this.setActive(shouldHover);
    }

    if (typeof this.remove_style_pseudo_class === 'function') {
      if (shouldHover) {
        this.add_style_pseudo_class('hover');
      } else {
        this.remove_style_pseudo_class('hover');
        this.remove_style_pseudo_class('active');
        this.remove_style_pseudo_class('checked');
      }
    }

    if (this.actor) {
      if (typeof this.actor.set_hover === 'function') {
        this.actor.set_hover(shouldHover);
      }
      if (typeof this.actor.remove_style_pseudo_class === 'function') {
        if (shouldHover) {
          this.actor.add_style_pseudo_class('hover');
        } else {
          this.actor.remove_style_pseudo_class('hover');
          this.actor.remove_style_pseudo_class('active');
          this.actor.remove_style_pseudo_class('checked');
        }
      }
    }
  }

  _scheduleClose() {
    this._cancelClose();
    this._hoverCloseTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      HOVER_CLOSE_DELAY_MS,
      () => {
        const pointerState = this._getPointerState();

        if (pointerState === PointerState.INSIDE_RECENT) {
          this._hoverCloseTimeoutId = 0;
          return GLib.SOURCE_REMOVE;
        }

        if (pointerState === PointerState.INSIDE_SUBMENU) {
          this._setSubmenuHover(true);
          this._hoverCloseTimeoutId = 0;
          return GLib.SOURCE_REMOVE;
        }

        if (pointerState === PointerState.BRIDGE) {
          this._setSubmenuHover(true);
          return GLib.SOURCE_CONTINUE;
        }

        this._hoverCloseTimeoutId = 0;
        this._closeAndDestroyRecentMenu();
        this._setSubmenuHover(false);
        return GLib.SOURCE_REMOVE;
      }
    );
    GLib.Source.set_name_by_id(this._hoverCloseTimeoutId, 'AppMenuHoverCloseDelay');
  }

  _scheduleOpen() {
    this._cancelOpenDelay();

    if (this._recentMenu && this._recentMenu.isOpen) {
      return;
    }

    this._openDelayTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      RECENT_OPEN_DELAY_MS,
      () => {
        this._openDelayTimeoutId = 0;
        this._ensureRecentMenuAndOpen().catch(logError);
        return GLib.SOURCE_REMOVE;
      }
    );
    GLib.Source.set_name_by_id(this._openDelayTimeoutId, 'AppMenuRecentOpenDelay');
  }

  _disconnectRecentMenuSignals() {
    this._recentMenuSignalIds.forEach(({ target, id }) => {
      if (target && id) {
        try {
          target.disconnect(id);
        } catch (_error) {
          // Ignore, signal already disconnected during teardown
        }
      }
    });
    this._recentMenuSignalIds = [];

    if (!this._recentMenu) {
      this._recentMenuMenuSignalIds = [];
      return;
    }

    this._recentMenuMenuSignalIds.forEach((id) => {
      if (id) {
        try {
          this._recentMenu.disconnect(id);
        } catch (_error) {
          // Ignore if already disconnected during teardown
        }
      }
    });
    this._recentMenuMenuSignalIds = [];
  }

  _disconnectMainMenuItemSignals() {
    this._mainMenuItemSignalIds.forEach(({ actor, signalId }) => {
      if (actor && signalId) {
        try {
          actor.disconnect(signalId);
        } catch (_error) {
          // Ignore if already disconnected during teardown
        }
      }
    });
    this._mainMenuItemSignalIds = [];
  }

  _connectMainMenuItemSignals() {
    this._disconnectMainMenuItemSignals();

    if (!this._parentMenu || typeof this._parentMenu._getMenuItems !== 'function') {
      return;
    }

    const menuItems = this._parentMenu._getMenuItems();
    menuItems.forEach((item) => {
      if (!item || item === this) {
        return;
      }

      const actor = item.actor;
      if (!actor || actor === this.actor || !actor.reactive) {
        return;
      }

      actor.track_hover = true;
      const signalId = actor.connect('enter-event', () => {
        if (!this._recentMenu || !this._recentMenu.isOpen) {
          return Clutter.EVENT_PROPAGATE;
        }

        // Only close recent menu if we're entering a different menu item
        this._cancelClose();
        this._cancelOpenDelay();
        this._closeAndDestroyRecentMenu();
        this._setSubmenuHover(false);
        return Clutter.EVENT_PROPAGATE;
      });

      this._mainMenuItemSignalIds.push({ actor, signalId });
    });
  }

  async _ensureRecentMenuAndOpen() {
    const menu = await this._ensureRecentMenu();
    menu.open(true);
  }

  async _ensureRecentMenu() {
    if (this._recentMenu) {
      await this._populateMenu(this._recentMenu);
      if (this._isDestroyed) return this._recentMenu;
      this._connectMainMenuItemSignals();
      return this._recentMenu;
    }

    this._recentMenu = new PopupMenu.PopupMenu(this.actor, 0.0, St.Side.RIGHT);
    this._recentMenu.actor.add_style_class_name('appmenu-recent-menu');
    this._recentMenu.actor.track_hover = true;
    this._recentMenu.actor.reactive = true;

    this._recentMenuHoverActor = this._recentMenu.box ?? this._recentMenu.actor;
    // Track hover on the visible menu box to detect real pointer exits.
    if (this._recentMenuHoverActor) {
      this._recentMenuHoverActor.track_hover = true;
      this._recentMenuHoverActor.reactive = true;
    }

    Main.layoutManager.addTopChrome(this._recentMenu.actor);
    this._chromeAdded = true;

    if (!this._managerRegistered && this._recentMenuManager) {
      this._recentMenuManager.addMenu(this._recentMenu);
      this._managerRegistered = true;
    }

    await this._populateMenu(this._recentMenu);
    if (this._isDestroyed) return this._recentMenu;
    this._connectMainMenuItemSignals();

    this._recentMenuMenuSignalIds.push(
      this._recentMenu.connect('open-state-changed', (_, open) => {
        if (open) {
          this._cancelClose();
          this._startGlobalHoverMonitor();
        } else {
          this._stopGlobalHoverMonitor();
          this._closeAndDestroyRecentMenu();
        }
      })
    );

    if (this._recentMenuHoverActor) {
      const enterId = this._recentMenuHoverActor.connect('enter-event', () => {
        this._cancelClose();
        this._cancelOpenDelay();
        this._setSubmenuHover(true);
        return Clutter.EVENT_PROPAGATE;
      });
      this._recentMenuSignalIds.push({ target: this._recentMenuHoverActor, id: enterId });

      const leaveId = this._recentMenuHoverActor.connect('leave-event', () => {
        this._scheduleClose();
        return Clutter.EVENT_PROPAGATE;
      });
      this._recentMenuSignalIds.push({ target: this._recentMenuHoverActor, id: leaveId });
    }

    if (this._mainMenuCloseId === 0) {
      this._mainMenuCloseId = this._parentMenu.connect('open-state-changed', (_, open) => {
        if (!open) {
          this._closeAndDestroyRecentMenu();
        }
      });
    }

    if (this._submenuDestroyId === 0) {
      this._submenuDestroyId = this.connect('destroy', () => {
        this._closeAndDestroyRecentMenu();
      });
    }

    return this._recentMenu;
  }

  _getActorBounds(actor) {
    if (!actor) {
      return null;
    }

    const [stageX, stageY] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();

    if (width === 0 || height === 0) {
      return null;
    }

    return {
      x1: stageX,
      y1: stageY,
      x2: stageX + width,
      y2: stageY + height,
    };
  }

  _getPointerPosition() {
    // GNOME 45+ deprecated global.get_pointer(); use modern seat API
    try {
      const seat = Clutter.get_default_backend().get_default_seat();
      const device = seat.get_pointer();
      const [, x, y] = device.get_coords();
      return [x, y];
    } catch (_e) {
      // Fallback for older GNOME Shell
      return global.get_pointer();
    }
  }

  _getPointerState() {
    if (!this._recentMenu) {
      return PointerState.OUTSIDE;
    }

    const [pointerX, pointerY] = this._getPointerPosition();
    const submenuBounds = this._getActorBounds(this.actor);
    const recentBounds = this._getActorBounds(this._recentMenuHoverActor ?? this._recentMenu.actor);

    const pointWithin = (bounds, tolerance = 0) =>
      bounds &&
      pointerX >= bounds.x1 - tolerance &&
      pointerX <= bounds.x2 + tolerance &&
      pointerY >= bounds.y1 - tolerance &&
      pointerY <= bounds.y2 + tolerance;

    // Check if pointer is inside the recent items popup menu
    if (pointWithin(recentBounds, POINTER_TOLERANCE_PX)) {
      return PointerState.INSIDE_RECENT;
    }

    // Check if pointer is inside the submenu item in the main menu
    if (pointWithin(submenuBounds, POINTER_TOLERANCE_PX)) {
      return PointerState.INSIDE_SUBMENU;
    }

    if (!submenuBounds || !recentBounds) {
      return PointerState.OUTSIDE;
    }

    const overlapTop = Math.max(submenuBounds.y1, recentBounds.y1);
    const overlapBottom = Math.min(submenuBounds.y2, recentBounds.y2);

    if (overlapBottom >= overlapTop) {
      // Allow a narrow horizontal bridge between the submenu and popup.
      // This bridge exists only to allow smooth transitions.
      const submenuRight = submenuBounds.x2;
      const recentLeft = recentBounds.x1;
      const gapWidth = Math.max(0, recentLeft - submenuRight);
      const bridgeTolerance = Math.min(POINTER_TOLERANCE_PX, gapWidth + 4);

      if (
        pointerX >= submenuRight - 2 &&
        pointerX <= recentLeft + bridgeTolerance &&
        pointerY >= overlapTop - POINTER_TOLERANCE_PX &&
        pointerY <= overlapBottom + POINTER_TOLERANCE_PX
      ) {
        return PointerState.BRIDGE;
      }
    }

    return PointerState.OUTSIDE;
  }

  _closeAndDestroyRecentMenu() {
    this._cancelOpenDelay();

    if (!this._recentMenu || this._recentMenuClosing) {
      this._setSubmenuHover(false);
      return;
    }

    this._recentMenuClosing = true;

    try {
      this._cancelClose();
      this._stopGlobalHoverMonitor();

      if (this._mainMenuCloseId !== 0) {
        this._parentMenu.disconnect(this._mainMenuCloseId);
        this._mainMenuCloseId = 0;
      }

      if (this._submenuDestroyId !== 0) {
        try {
          this.disconnect(this._submenuDestroyId);
        } catch (_error) {
          // Signal was already disconnected, ignore
        }
        this._submenuDestroyId = 0;
      }

      this._disconnectRecentMenuSignals();
      this._disconnectMainMenuItemSignals();

      if (this._recentMenu.isOpen) {
        this._recentMenu.close(true);
      }

      if (this._managerRegistered && this._recentMenuManager) {
        this._recentMenuManager.removeMenu(this._recentMenu);
        this._managerRegistered = false;
      }

      if (this._chromeAdded) {
        Main.layoutManager.removeChrome(this._recentMenu.actor);
        this._chromeAdded = false;
      }

      this._recentMenu.destroy();
      this._recentMenu = null;
      this._recentMenuHoverActor = null;
      this._setSubmenuHover(false);
    } finally {
      this._recentMenuClosing = false;
    }
  }

  _createMenuItemWithIcon(labelText, gicon, fallbackIconName) {
    const menuItem = new PopupMenu.PopupMenuItem('');

    const iconProps = {
      style_class: 'popup-menu-icon',
      y_align: Clutter.ActorAlign.CENTER,
    };

    if (gicon) {
      iconProps.gicon = gicon;
    } else if (fallbackIconName) {
      iconProps.icon_name = fallbackIconName;
    }

    const icon = new St.Icon(iconProps);
    menuItem.insert_child_at_index(icon, 0);

    if (menuItem.label) {
      menuItem.label.text = labelText;
      menuItem.label.x_expand = true;
      menuItem.label.y_align = Clutter.ActorAlign.CENTER;
    } else {
      const label = new St.Label({
        text: labelText,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      menuItem.add_child(label);
    }

    return menuItem;
  }

  _attachDocumentTooltip(menuItem, uri) {
    const actor = menuItem?.actor ?? null;
    const tooltipText = this._formatDocumentTooltip(uri);

    if (!actor || !tooltipText) {
      return;
    }

    const tooltip = new DocumentTooltip(actor, tooltipText);

    menuItem.connect('destroy', () => {
      tooltip.destroy();
    });

    menuItem.connect('activate', () => {
      tooltip.close();
    });
  }

  _formatDocumentTooltip(uri) {
    if (!uri || typeof uri !== 'string') {
      return null;
    }

    if (uri.startsWith('file://')) {
      const path = uri.substring('file://'.length);
      return GLib.uri_unescape_string(path, null) ?? path;
    }

    return GLib.uri_unescape_string(uri, null) ?? uri;
  }

  _getRecentFileIcon(uri, isDirectory) {
    if (!uri || typeof uri !== 'string') {
      return null;
    }

    if (!uri.startsWith('file://')) {
      return null;
    }

    try {
      const file = Gio.File.new_for_uri(uri);
      if (!file.query_exists(null)) {
        return null;
      }

      const info = file.query_info('standard::icon,standard::type', Gio.FileQueryInfoFlags.NONE, null);
      if (info) {
        return info.get_icon?.() ?? null;
      }
    } catch (_error) {
      // Swallow errors; fall back to themed icon based on item type.
    }

    if (isDirectory) {
      return new Gio.ThemedIcon({ names: ['folder-symbolic'] });
    }

    return null;
  }

  _launchRecentUri(uri) {
    if (!uri) {
      return;
    }

    try {
      const context = global.create_app_launch_context(0, -1);
      Gio.AppInfo.launch_default_for_uri(uri, context);
    } catch (error) {
      const displayName = this._formatDocumentTooltip(uri) ?? uri;
      this._notifyLaunchFailure(
        'Item unavailable',
        `Could not open "${displayName}".`
      );
      logError(error, `Failed to open recent item: ${uri}`);
    } finally {
      this._parentMenu.close(true);
      this._closeAndDestroyRecentMenu();
    }
  }

  _launchRecentApplication(appInfo, desktopId) {
    if (!appInfo) {
      this._parentMenu.close(true);
      this._closeAndDestroyRecentMenu();
      return;
    }

    try {
      const context = global.create_app_launch_context(0, -1);
      if (typeof appInfo.launch === 'function') {
        appInfo.launch([], context);
      }
    } catch (error) {
      const fallbackId =
        (typeof appInfo.get_id === 'function' && appInfo.get_id()) ||
        (typeof appInfo.get_name === 'function' && appInfo.get_name()) ||
        desktopId ||
        'unknown';
      this._notifyLaunchFailure(
        'Application unavailable',
        `Could not launch "${fallbackId}".`
      );
      logError(error, `Failed to launch application: ${fallbackId}`);
    } finally {
      this._parentMenu.close(true);
      this._closeAndDestroyRecentMenu();
    }
  }

  _notifyLaunchFailure(title, message) {
    try {
      Main.notifyError(title, message);
    } catch (error) {
      logError(error, 'Failed to display AppMenu notification');
    }
  }

  async _getApplicationState() {
    const state = new Map();
    const file = Gio.File.new_for_path(APPLICATION_STATE_FILE);

    if (!file.query_exists(null)) {
      return state;
    }

    try {
      const text = await loadFileTextAsync(file, this._cancellable);
      if (this._isDestroyed) {
        return state;
      }
      const regex = /<application\b([^>]*)\/>/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const attributes = match[1] ?? '';
        const idMatch = /\bid="([^"]+)"/.exec(attributes);

        if (!idMatch) {
          continue;
        }

        const id = idMatch[1];
        const scoreMatch = /\bscore="([^"]+)"/.exec(attributes);
        const lastSeenMatch = /\blast-seen="([^"]+)"/.exec(attributes);
        const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : 0;
        const lastSeen = lastSeenMatch ? Number.parseInt(lastSeenMatch[1], 10) : 0;

        state.set(id, {
          score: Number.isFinite(score) ? score : 0,
          lastSeen: Number.isFinite(lastSeen) ? lastSeen : 0,
        });
      }
    } catch (error) {
      if (error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
        return state;
      }
      logError(error, 'Failed to read recent applications state');
    }

    return state;
  }

  async _getRecentApplications(limit = APPLICATIONS_RECENT_LIMIT) {
    const applications = [];

    if (!Shell?.AppUsage?.get_default) {
      return applications;
    }

    const sortMode = APPLICATION_SORT_MODE === 'recent' ? 'recent' : 'usage';
    const stateMap = sortMode === 'recent' ? await this._getApplicationState() : null;

    try {
      const usage = Shell.AppUsage.get_default();
      if (!usage || typeof usage.get_most_used !== 'function') {
        return applications;
      }

      const appSystem = Shell.AppSystem?.get_default?.() ?? null;
      const seen = new Set();
      const rawCandidates = usage.get_most_used?.();
      const candidates = [];

      if (Array.isArray(rawCandidates)) {
        candidates.push(...rawCandidates);
      } else if (rawCandidates) {
        for (let node = rawCandidates; node; node = node.next ?? null) {
          const candidate = node.data ?? node;
          if (candidate) {
            candidates.push(candidate);
          }
        }
      }

      for (const app of candidates) {
        if (sortMode === 'usage' && applications.length >= limit) {
          break;
        }

        if (!app || typeof app.get_id !== 'function') {
          continue;
        }

        const desktopId = app.get_id();
        if (!desktopId || seen.has(desktopId)) {
          continue;
        }

        seen.add(desktopId);

        const appInfo = app.get_app_info?.() ?? appSystem?.lookup_app?.(desktopId)?.get_app_info?.();
        if (!appInfo) {
          continue;
        }

        const fallbackName =
          typeof desktopId === 'string' && desktopId.endsWith('.desktop')
            ? desktopId.slice(0, -'.desktop'.length)
            : desktopId;

        const title =
          appInfo.get_display_name?.() ??
          appInfo.get_name?.() ??
          app.get_name?.() ??
          fallbackName;

        const gicon = app.get_gicon?.() ?? appInfo.get_icon?.() ?? null;

        applications.push({
          title,
          appInfo,
          gicon,
          desktopId,
        });
      }
    } catch (error) {
      logError(error, 'Failed to resolve recent applications');
    }

    if (sortMode === 'recent' && applications.length > 1) {
      applications.sort((a, b) => {
        const aState = stateMap?.get(a.desktopId);
        const bState = stateMap?.get(b.desktopId);
        return (bState?.lastSeen ?? 0) - (aState?.lastSeen ?? 0);
      });
    }

    return applications.slice(0, limit);
  }

  async _getRecentItems() {
    const file = Gio.File.new_for_path(RECENT_ITEMS_FILE);
    if (!file.query_exists(null)) {
      return [];
    }

    let text;
    try {
      text = await loadFileTextAsync(file, this._cancellable);
    } catch (error) {
      if (error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
        return [];
      }
      logError(error, 'Failed to read recent items list');
      return [];
    }

    if (this._isDestroyed) {
      return [];
    }

    const regex = /<bookmark[^>]*href="([^"]+)"[^>]*modified="([^"]+)"[^>]*>([\s\S]*?<title>([^<]*)<\/title>)?/g;
    const items = [];
    const seenUris = new Set();

    let match;
    while ((match = regex.exec(text)) !== null) {
      const uri = match[1];
      const modified = match[2];
      const titleMarkup = match[4] ?? '';

      if (seenUris.has(uri)) {
        continue;
      }
      seenUris.add(uri);

      let timestamp = 0;
      try {
        const dateTime = GLib.DateTime.new_from_iso8601(modified, null);
        if (dateTime) {
          timestamp = dateTime.to_unix();
        }
      } catch (error) {
        logError(error, `Failed to parse modified time for ${uri}`);
      }

      let title = titleMarkup.trim();
      if (!title) {
        const decodedUri = GLib.uri_unescape_string(uri, null) ?? uri;
        if (decodedUri.startsWith('file://')) {
          const filePath = decodedUri.substring('file://'.length);
          title = GLib.path_get_basename(filePath);
        } else {
          title = decodedUri;
        }
      }

      // Determine if this is a directory
      let isDirectory = false;
      if (uri.startsWith('file://')) {
        try {
          const filePath = uri.substring('file://'.length);
          const file = Gio.File.new_for_path(filePath);
          if (file.query_exists(null)) {
            const fileInfo = file.query_info(
              'standard::type',
              Gio.FileQueryInfoFlags.NONE,
              null
            );
            isDirectory = fileInfo.get_file_type() === Gio.FileType.DIRECTORY;
          }
        } catch (error) {
          // If we can't determine, assume it's a file
          isDirectory = false;
        }
      }

      items.push({
        title,
        uri,
        timestamp,
        isDirectory,
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);

    return items;
  }
});
