# AppMenu

<div align="center">

**A zero-dependency macOS-style global menu bar for GNOME Shell**

[![GNOME](https://img.shields.io/badge/GNOME-45%E2%80%9351-blue?logo=gnome)](https://www.gnome.org/)
[![License](https://img.shields.io/badge/license-GPL--3.0-green.svg)](LICENSE)
[![Release](https://img.shields.io/badge/release-v5.7.1-orange)](https://github.com/ChathurangaBW/AppMenu/releases)

</div>

<p align="center">
  <img src="screenshot.png" alt="AppMenu global menu bar screenshot" width="900" />
</p>

AppMenu brings a macOS-style **global menu bar** to the GNOME top panel. Often called a **global menu** or **macOS (Mac) menu**, it provides app-aware menus, real exported app menus where available, keyboard shortcuts, recent items, workspace controls, search, and fast user switching in a single lightweight GNOME Shell extension.

## Why AppMenu

- **No external daemon**: a pure GJS extension — no Python service, no appmenu daemon to manage
- **No manual GTK module setup**: no `~/.gtkrc-2.0` edits, no helper scripts
- **Broad app coverage**: GTK, Qt, Electron, Flatpak, browsers, terminals, and Java apps share the same menu bar, with graceful fallbacks where apps expose no menu data
- **Wayland-friendly**: built on GNOME Shell APIs and virtual keyboard events, not X11-only menu scraping
- **Hybrid menus**: reads real exported menus when apps provide them and falls back automatically when they do not

## Global Menu Reference

In the "global menu" pattern, an app's menus live in a single bar at the top of the screen rather than inside each app window. This is what macOS calls the menu bar. (You may also find AppMenu under the names "global menu GNOME", "macOS menu", "Mac menu", "macOS menu bar", or "HUD menu" — it is the same project.)

| Project | What it does | How AppMenu relates |
|---|---|---|
| **AppMenu** (this repo) | One global menu bar across all of GNOME Shell, plus Apple menu, search, user switching, and workspace indicator | The modern, zero-dependency global menu for GNOME 45–51 |
| global-menu-for-gnome | Generic global menu bar with a system menu | AppMenu is a superset (everything it has, plus real menus, search, user switcher, workspace indicator, i18n) |
| Fildem | Qt/GTK HUD with dbusmenu backend | AppMenu achieves the same coverage without the Python appmenu daemon |
| Kiwi Menu | macOS-style menu bar | AppMenu ships that menu bar plus more utilities |
| Ubuntu's appmenu-gtk-module | Legacy X11 module | AppMenu does not rely on it |

## Highlights

- Apple menu with system actions, recent items, and Search
- AppMenu Status submenu with copyable troubleshooting information
- Dynamic app menu (global menu) based on the focused window
- Optional real D-Bus app menu import for supported apps
- File, Edit, View, Go, Window, and Help menus
- System actions in the Apple menu: Force Quit, Sleep, Restart, Shut Down, Lock Screen, and Log Out
- Workspace navigation and window-to-workspace actions
- Optional workspace navigation dots in the panel
- Spotlight-style search dialog for apps, recent files, and settings, with a configurable shortcut
- Fast user switching with avatars and session badges
- Configurable distro icon or Apple logo
- Searchable visual gallery for panel icons
- Custom user-defined menu items (commands or keyboard shortcuts, configured via dconf JSON)
- Debug logging toggle for troubleshooting
- GNOME Shell 45 to 51 support

## Features

### Apple Menu

- About This System
- AppMenu Status with current app, menu source, and copyable troubleshooting info
- System Settings
- Software
- Recent Items
- Search
- Force Quit
- Sleep, Restart, Shut Down
- Lock Screen, Log Out

### Global Menu Bar

| Menu | What it includes |
|---|---|
| **App** | About, Settings, Hide / Hide Others / Show All, open windows list, New Window, Quit |
| **File** | Open Home, New Folder, New Tab, Open, Open With, Print, Get Info, Rename, Find, Move to Trash, Eject, Close Window |
| **Edit** | Undo, Redo, Cut, Copy, Paste, Delete, Select All, Emoji & Symbols |
| **View** | As Icons / As List, sorting, reverse sort order, path bar toggle, hidden files, full screen |
| **Go** | Back, Forward, Recents, Documents, Desktop, Downloads, Home, Computer, Network, Applications, Utilities |
| **Window** | Minimize, Maximize, Tile Left / Right, workspace switching, move window between workspaces, Bring All to Front, Close |
| **Help** | Send Feedback |

### Spotlight-Style Search

Open AppMenu Search from the Apple menu or with `Ctrl+Space`.

Change or disable the shortcut in **Preferences → Menu Behavior → Search shortcut**. Click the current shortcut and press a new Control, Alt, or Super combination. Escape cancels; Backspace disables it. The Reset button restores `Ctrl+Space`. Changes take effect immediately, freeing the previous shortcut for applications.

Search sources:

- Installed applications
- Recent files
- GNOME Settings panels

Results are grouped by type and show icons so users can tell apps, recent files, and settings apart quickly.

### Workspace Controls

The Window menu includes:

- Previous Workspace
- Next Workspace
- Move Window Left
- Move Window Right

Enable **Show Workspace Indicator** in preferences to show workspace navigation dots in the panel. Use **Workspace Indicator Position** to place the dots on the left or right side of the top panel.

## AppMenu vs Other GNOME Menu Extensions

AppMenu, global-menu-for-gnome, Fildem, and Kiwi Menu are all "global menu" extensions for GNOME Shell: a single menu bar at the top of the screen instead of per-window menus. AppMenu is the modern, zero-dependency, full-featured option.

| Feature | AppMenu | Fildem | global-menu-for-gnome | Kiwi Menu |
|---|---:|---:|---:|---:|
| Pure GNOME Shell extension (no external daemon) | Yes | No | Yes | Yes |
| Global menu bar across all of GNOME | Yes | Yes | Yes | Yes |
| External daemon required | No | Yes | No | No |
| GTK module setup required | No | Yes | No | No |
| Works with GTK/Qt/Electron/Flatpak apps | Yes | Partial | Partial | N/A |
| Real exported app menus (dbusmenu, org.gtk.Actions) | Yes | Yes | No | No |
| Synthetic-action fallback when no exported menu | Yes | No | No | No |
| Window list per app | Yes | No | No | No |
| Quit App, per-app Settings | Yes | No | No | No |
| Force Quit | Yes | No | Yes | No |
| Recent items | Yes | No | No | Yes |
| Fast user switching | Yes | No | No | No |
| Workspace indicator/actions | Yes | No | No | No |
| Spotlight-style search | Yes | HUD only | No | No |
| System actions (Force Quit, Power, Session) | Yes | No | Yes | No |
| Custom user-defined menus | Yes | No | Yes | No |
| i18n / translations | Yes | No | No | No |
| One-shot installers (.run, .bin, .deb) | Yes | Yes | No | No |
| Stale-copy detection (`--clean-stale`) | Yes | No | No | No |
| GNOME Shell 45 to 51 support | Yes | Yes | Yes | Yes |

AppMenu uses a **hybrid approach**:

- For apps that export Canonical dbusmenu data, AppMenu reads and triggers the real menu items
- For modern GTK and libadwaita apps that expose `org.gtk.Actions`, AppMenu builds native action-backed menus without synthetic key presses
- For apps that expose neither, AppMenu falls back to stable cross-app actions and shortcuts

This keeps the extension useful on GTK4, Qt, Electron, Java, Flatpak, and Wayland, where full exported menu trees are often partial or absent.

## Installation

### From GNOME Extensions

Use the dedicated upload package when submitting to extensions.gnome.org:

- `AppMenu-e.g.o-upload-v5.7.1.zip`

This ZIP has `metadata.json` and `extension.js` at the archive root, which is required by the GNOME Extensions upload validator.

### Release Packages

Download from the [latest release](https://github.com/ChathurangaBW/AppMenu/releases):

- `AppMenu-e.g.o-upload-v5.7.1.zip`: upload package for extensions.gnome.org
- `appmenu@ChathurangaBW.github.io.zip`: manual GNOME Shell extension package
- `AppMenu-v5.7.1-linux.run`: one-shot self-extracting installer
- `AppMenu-v5.7.1-linux.bin`: one-shot self-extracting installer alias
- `appmenu_5.7.1_all.deb`: Debian and Ubuntu package
- `AppMenu-v5.7.1.zip`: source snapshot

### From Source

```bash
git clone https://github.com/ChathurangaBW/AppMenu.git
cd AppMenu
bash install.sh
```

For a system-wide install, such as `/usr/local/share/gnome-shell/extensions`, run:

```bash
sudo bash install.sh --system --prefix=/usr/local
```

To replace a system package location, use `--prefix=/usr` instead.

Then restart GNOME Shell:

- **Wayland:** log out and log back in
- **X11:** press `Alt+F2`, type `r`, then press Enter

## Configuration

Open preferences with:

```bash
gnome-extensions prefs appmenu@ChathurangaBW.github.io
```

Available settings:

| Setting | Description |
|---|---|
| **Show OS icon** | Toggle the logo near the Apple menu |
| **Icon** | Select a distro icon or Apple logo |
| **Lock to focused app** | Keep panel app label tied to the focused app |
| **Use real application menus** | Use dbusmenu or native GTK action exports when supported, with automatic fallback |
| **Search shortcut** | Change, disable, or reset the shortcut that opens AppMenu Search |
| **Show User Switcher** | Show avatar-based fast user switching |
| **Show Workspace Indicator** | Show workspace navigation dots |
| **Workspace Indicator Position** | Choose left or right panel placement for workspace dots |
| **Debug Logging** | Enable diagnostic GNOME Shell journal logs |
| **Reset AppMenu Settings** | Restore AppMenu preferences to packaged defaults |

Preferences are grouped into Appearance, Menu Behavior, Panel Extras, and Diagnostics sections.

## Troubleshooting

### Missing Dbusmenu typelib

If an older version reports `Typelib file for namespace 'Dbusmenu', version '0.4' not found`, upgrade to the latest release and log out/back in. Dbusmenu is optional: without it, AppMenu still provides GTK action menus and fallback menus. The error shown in [issue #3](https://github.com/ChathurangaBW/AppMenu/issues/3) was this missing typelib, not a missing `i18n.js` file.

### AppMenu appears to do nothing

1. Open the Apple menu in the top panel.
2. Open **AppMenu Status**.
3. Choose **Copy Troubleshooting Info**.
4. Paste that information into the GitHub issue, along with your GNOME version and whether you are on Wayland or X11.

The status submenu reports the focused app, app ID, window class, real-menu setting, menu source, debug logging state, user switcher state, and workspace indicator state.

### Real menus vs fallback menus

AppMenu tries real exported menus first when **Use real application menus** is enabled. Some modern apps, sandboxed apps, or Wayland sessions do not expose full menu trees. In those cases AppMenu falls back to stable cross-app actions so the menu bar remains useful instead of disappearing.

### After installing or upgrading

GNOME Shell can keep old extension modules cached in the current Wayland session. If AppMenu still behaves like an older version after installing or upgrading:

- **Wayland:** log out and log back in.
- **X11:** press `Alt+F2`, type `r`, then press Enter.

This is a GNOME Shell session cache behavior. The installed files can be correct while the already-running shell still has old module code loaded.

### `i18n.js` missing from `/usr/local/share`

If GNOME Shell reports an error like `Unable to load file ... /usr/local/share/gnome-shell/extensions/appmenu@ChathurangaBW.github.io/i18n.js`, a stale system-wide install is shadowing the updated user install. The old copy does not have `i18n.js`, and GNOME Shell loads it instead of the new one.

**Automatic fix (recommended):**

```bash
bash install.sh --clean-stale
```

This removes stale copies in other extension folders before installing. Then log out and back in.

**Manual fix:**

```bash
sudo rm -rf /usr/local/share/gnome-shell/extensions/appmenu@ChathurangaBW.github.io
sudo rm -rf /usr/share/gnome-shell/extensions/appmenu@ChathurangaBW.github.io
bash install.sh
```

If you intentionally want a system-wide install, use:

```bash
sudo bash install.sh --system --prefix=/usr/local
test -f /usr/local/share/gnome-shell/extensions/appmenu@ChathurangaBW.github.io/i18n.js
```

### Collecting logs

Enable **Debug Logging** in preferences only while troubleshooting. Then collect logs with:

```bash
journalctl --user -b | grep -i AppMenu
```

Disable debug logging again after collecting the information.

## Development

Build release packages:

```bash
./scripts/build-packages.sh
./scripts/verify-release.sh 5.7.1
```

Generated files and SHA-256 checksums go to `dist/`. Release builds require a clean tracked worktree; use `APPMENU_ALLOW_DIRTY=1` only for local development artifacts. The verifier rejects workspace contamination, mismatched checksums, invalid archives, and synchronous D-Bus calls in runtime JavaScript.

GNOME 51 runtime QA results and coverage limits are documented in [QA-v5.7.0.md](QA-v5.7.0.md). Shortcut and missing-Dbusmenu regressions are documented in [QA-v5.7.1.md](QA-v5.7.1.md).

## Project Structure

```text
AppMenu/
├── extension.js                 # Extension lifecycle
├── menuManager.js               # Panel menu orchestration
├── compatibility.js             # GNOME version compatibility helpers
├── searchDialog.js              # Spotlight-style search dialog
├── workspaceIndicator.js        # Workspace dots controller
├── prefs.css                    # Preferences gallery styling
├── userSwitcher.js              # Fast user switching UI
├── recentItemsSubmenu.js        # Recent items submenu
├── documentTooltip.js           # Recent item tooltip support
├── logger.js                    # Debug-gated logging
├── prefs.js                     # Preferences window
├── stylesheet.css               # Shell styling
├── screenshot.png               # README screenshot
├── schemas/                     # GSettings schema
├── actions/                     # Action handlers (incl. accelerator parsing)
├── menus/                       # Menu definitions
├── icons/                       # SVG icons
├── scripts/build-packages.sh    # Release package builder
├── install.sh
└── uninstall.sh
```

## License

GPL-3.0-or-later © ChathurangaBW

<div align="center">
  <sub>Built for GNOME. Inspired by macOS.</sub>
</div>
