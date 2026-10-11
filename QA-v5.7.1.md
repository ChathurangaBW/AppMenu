# v5.7.1 issue regression checks

Tested on GNOME Shell 51.0 / Wayland in an isolated headless compositor.

- Runtime: 39/39 passed with Dbusmenu installed.
- Preferences: 12/12 passed, including shortcut capture/persistence, cancel,
  invalid typing-key rejection, disable, individual reset, and global reset.
- Runtime with Dbusmenu unavailable: 39/39 passed. In a bubblewrap mount namespace,
  `/dev/null` was mounted over the Dbusmenu-0.4 typelib. Attempting to import it
  produced the exact `Typelib file ... not found` error from issue #3, while
  AppMenu remained ACTIVE and all eight fallback panel menus worked.
- Integration without Dbusmenu: 11/11 passed on rerun, including native GTK
  discovery/activation, clipboard shortcuts, window management and workspace moves.
  The first run had one clipboard timing failure (cut text remained); the
  unchanged suite passed with a fresh GTK fixture. This is not a long-session
  stability result.
- Shortcut runtime test uses virtual key events: after rebinding to Ctrl+Alt+Space,
  Ctrl+Space no longer opens search, the new binding opens it, and disabling
  prevents activation. No restart required for binding changes.

Issue #3's screenshot explicitly shows missing Dbusmenu, not missing i18n.js.
The optional import existed in recent releases; v5.7.1 removes its dependency
on a specific GIRepository API, with startup tested in both dependency states.

Release checks: strict schema compilation, shell syntax, locale compilation,
archive integrity and SHA-256 checksums via scripts/verify-release.sh.
Other GNOME releases and a real dbusmenu registrar application were not tested.
