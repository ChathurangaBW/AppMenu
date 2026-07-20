/*
 * documentTooltip.js - Provides a delayed tooltip for document entries.
 */

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TOOLTIP_DELAY_MS = 1000;

export const DocumentTooltip = GObject.registerClass(
  { GTypeName: 'AppMenuDocumentTooltip' },
  class DocumentTooltip extends St.Label {
    _init(targetActor, text, delayMs = TOOLTIP_DELAY_MS) {
      super._init({
        text,
        style_class: 'shell-tooltip appmenu-document-tooltip',
        visible: false,
        reactive: false,
        opacity: 0,
      });

      this._target = targetActor;
      this._delayMs = delayMs;
      this._timeoutId = 0;
      this._targetSignals = [];

      if (!this._target) {
        return;
      }

      this._target.track_hover = true;

      this._targetSignals.push(
        this._target.connect('notify::hover', () => {
          if (this._target.hover)
            this.open();
          else
            this.close();
        })
      );
      this._targetSignals.push(
        this._target.connect('button-press-event', () => {
          this.close();
          return Clutter.EVENT_PROPAGATE;
        })
      );

      Main.uiGroup.add_child(this);
      this.hide();
    }

    open() {
      if (this._timeoutId || !this._target) {
        return;
      }

      this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._delayMs, () => {
        this._timeoutId = 0;
        this._showTooltip();
        return GLib.SOURCE_REMOVE;
      });
      GLib.Source.set_name_by_id(this._timeoutId, 'AppMenuDocumentTooltipDelay');
    }

    close() {
      this._cancelTimeout();

      if (!this.visible) {
        return;
      }

      this.remove_all_transitions();
      this.ease({
        opacity: 0,
        duration: 100,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => this.hide(),
      });
    }

    destroy() {
      this._cancelTimeout();
      this._disconnectTargetSignals();
      this._target = null;
      if (this.get_parent()) {
        this.get_parent().remove_child(this);
      }
      super.destroy();
    }

    _showTooltip() {
      if (!this._target || !this._target.get_stage?.()) {
        return;
      }

      this.remove_all_transitions();
      this.opacity = 0;
      this.show();
      Main.uiGroup.set_child_above_sibling(this, null);

      this._reposition();

      this.ease({
        opacity: 255,
        duration: 150,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }

    _reposition() {
      if (!this._target) {
        return;
      }

      const extents = this._target.get_transformed_extents?.();
      if (!extents) {
        return;
      }

      const node = this.get_theme_node?.();
      const yOffset = node?.get_length?.('-y-offset') ?? 6;

      const [, naturalWidth] = this.get_preferred_width(-1);
      const [, naturalHeight] = this.get_preferred_height(naturalWidth);
      const tooltipWidth = this.width || naturalWidth;
      const tooltipHeight = this.height || naturalHeight;

      const stageWidth = global.stage?.width ?? 0;
      const stageHeight = global.stage?.height ?? 0;

      let x = extents.get_x();
      let y = extents.get_y() - tooltipHeight - yOffset;

      if (stageWidth > 0) {
        x = Math.max(0, Math.min(stageWidth - tooltipWidth, x));
      }

      if (stageHeight > 0) {
        y = Math.max(0, Math.min(stageHeight - tooltipHeight, y));
      }

      this.set_position(x, y);
    }

    _cancelTimeout() {
      if (!this._timeoutId) {
        return;
      }

      GLib.source_remove(this._timeoutId);
      this._timeoutId = 0;
    }

    _disconnectTargetSignals() {
      if (!this._target || this._targetSignals.length === 0) {
        return;
      }

      for (const signalId of this._targetSignals) {
        if (signalId && this._target) {
          try {
            this._target.disconnect(signalId);
          } catch (_error) {
            // Target already disconnected, ignore.
          }
        }
      }

      this._targetSignals = [];
    }
  }
);
