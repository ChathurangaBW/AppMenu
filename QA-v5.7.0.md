# QA — AppMenu v5.7.0 (GNOME 51)

Date: 2026-10-11. Host: Ubuntu 26.10, GNOME Shell 51.0 (mutter 51.0), Wayland, gjs 1.90.0.

## Runtime environment

All runtime suites ran in an isolated headless GNOME 51 session
(`gnome-shell --headless --wayland --no-x11 --virtual-monitor=1280x720`)
with a scratch `HOME`, private D-Bus daemon, and the candidate tree installed
as `appmenu@ChathurangaBW.github.io`. The live desktop session was untouched.

## Results: 92 passed, 0 failed

| Suite | Checks | Result |
|---|---|---|
| `scripts/qa-shell.js` — startup, panel menus, layout, appearance, user switcher, workspaces, search, keyboard dispatch, custom menus/shortcuts, diagnostics, real-menu fallback, recent items, enable/disable lifecycle | 38 | 38 passed |
| `scripts/qa-integration.js` — real GTK app focus label, native `org.gtk.Actions` discovery + activation, select-all/copy/cut/paste in a GTK text view, custom accelerator end-to-end, maximize/restore, minimize/bring-all-front, tile left/right, workspace move, fullscreen state, window close | 11 | 11 passed |
| `scripts/qa-features.js` — 6 Nautilus view settings, 3 view toggles, 24 command-routing checks, XBEL recent-document load + tooltip + clear | 35 | 35 passed |
| `scripts/qa-prefs.js` — window build, icon gallery, 6 switch bindings, icon size, workspace position, gallery selection, reset, close-during-load | 8 | 8 passed |

Shell log for the QA session: 0 `JS ERROR` lines from AppMenu. The only
AppMenu-adjacent warning is a benign mutter notice (`Tried to ping window …
with a bad serial`) against the disposable QA fixture in the headless session.

## Bugs found and fixed during this QA pass

- `St.BoxLayout` `vertical` property removed in GNOME 51 broke search dialog
  and user switcher. Fixed via `compatibility.js:5` (`orientation` with legacy
  fallback).
- `Clutter.get_default_backend()` unavailable in Shell 51. Fixed via
  `compatibility.js:12` (`global.stage.context.get_backend()` with fallback).
- `Clutter.accelerator_parse` unavailable in Shell 51. Fixed via
  `actions/accelerator.js` (GTK-style parsing without importing GTK).
- `Gio.DBus.session.call` with `@a{sv}`-style signature failed GTK action
  activation (`Invalid GVariant signature`). Fixed in `realMenuManager.js:687`.
- `Meta.Window.is_minimized()` / `global.display.get_monitor_work_area()`
  removed. Fixed with `minimized` property + `unminimize()` in
  `actions/windowActions.js:34`, and `get_work_area_for_monitor()` in
  `actions/windowActions.js:93,107`.
- Search returned unrelated apps and stole typing focus; result keyboard
  navigation grabbed focus on hover/render. Fixed in `searchDialog.js`.
- User-switcher panel children and stylesheet percentage lengths warned on
  Shell 51. Fixed in `userSwitcher.js` and `stylesheet.css:55,90`.

## Static + packaging gates

- `git diff --check`: clean.
- `bash -n` on `install.sh`, `uninstall.sh`, `scripts/build-packages.sh`,
  `scripts/verify-release.sh`: clean.
- `glib-compile-schemas --strict schemas`: clean.
- `build-locale.py compile`: 162 strings, clean.
- No `call_sync` in runtime JS (verifier-enforced).
- `./scripts/build-packages.sh` (v5.7.0): all 7 artifacts built.
- `./scripts/verify-release.sh 5.7.0`: passed (archive integrity, checksums,
  contamination, `.deb` info).

## Coverage limits (not tested here)

- Multi-monitor panels, fractional scaling, RTL locales.
- Non-GDM display managers (GDM session-switch path untested).
- Real dbusmenu registrar apps (no registrar on the test bus; GTK-actions path
  tested instead).
- `extensions.gnome.org` review/approval, and upgrades from every prior
  version (fresh install + enable/disable cycles tested).
- GNOME 45–50 regression run (code paths are version-branched for
  compatibility, but only Shell 51.0 executed here).
- Long-session stability (no multi-hour soak test).
