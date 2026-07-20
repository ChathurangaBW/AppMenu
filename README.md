# AppMenu

<div align="center">

**A macOS-inspired global menu bar for GNOME Shell**

[![GNOME](https://img.shields.io/badge/GNOME-45%E2%80%9350-blue?logo=gnome)](https://www.gnome.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3-orange)](metadata.json)

</div>

<p align="center">
  <img src="screenshot.png" alt="AppMenu Screenshot" width="800"/>
</p>

AppMenu places a clean, unified macOS-style application menu into the GNOME top panel — complete with window actions, navigation controls, quick-access keyboard shortcuts, and a fast user switcher with avatar support. It feels like the macOS Finder bar, right on Linux.

---

## Features

### System Menu ()

- **About This Computer** — extension info and links
- **System Settings** — opens GNOME Settings
- **Recent Items** — recently used files and applications with hover tooltips
- **Force Quit** — xkill-style force quit for misbehaving windows
- **Sleep, Restart, Shut Down, Lock Screen, Log Out** — full session control

### Global Menu Bar

| Menu | Actions |
|---|---|
| **File** | New Folder, Open, Save, Duplicate, Print, Rename, Eject, Connect to Server |
| **Edit** | Undo, Redo, Cut, Copy, Paste, Select All, Emoji & Symbols |
| **View** | Show Hidden Files, Reload, Icon Size (small/normal/large), Sort by Name/Date/Type/Size |
| **Go** | Back, Forward, Recents, Documents, Desktop, Downloads, Home, Computer |
| **Window** | Minimize, Maximize, Close, Full Screen, Tile Left/Right, Show All, Bring All to Front, Zoom |
| **Help** | Help, App Details, Report an Issue |
| **App** | Dynamic per-app submenu with About, Hide/Show Others, Quit, and open window list |

### Fast User Switching

- Avatar-based user switcher in the right side of the panel
- Click any user avatar to switch sessions
- GDM integration for login window access
- Shows currently logged-in users with visual badges

### Smart Context Menu

- Automatically shows the focused application's name in the panel
- Adds "Open Windows" section when multiple windows of the same app exist
- Blacklist support — hide the menu for specific apps (terminal, shell, etc.)

### Virtual Keyboard Shortcuts

All Edit menu shortcuts fire real key events via `Clutter.InputDevice` — works in any application including browsers, Electron apps, and terminals:

- **Ctrl+C** — Copy
- **Ctrl+V** — Paste
- **Ctrl+X** — Cut
- **Ctrl+Z** — Undo
- **Ctrl+Shift+Z** — Redo
- **Ctrl+A** — Select All
- **Ctrl+Shift+E** — Emoji picker

## Performance

Built with efficiency in mind:

- **Debounced focus events** — 50ms GLib timeout prevents rebuild storms during rapid Alt+Tab switching (which fires the signal 5-10x per transition)
- **In-place panel updates** — existing buttons are reused and relabeled instead of destroyed and recreated (zero widget churn at steady state)
- **Cached static menus** — File/Edit/View/Go/Window/Help menus computed once at module load, never rebuilt per focus change
- **Cached blacklist** — pre-lowercased with O(1) Set lookup and early exit when empty
- **Cached virtual keyboard device** — single Clutter device reused across all shortcut actions
- **Zero shell-outs** — all operations use GJS native APIs (no `GLib.spawn_command_line_async` for core features)

## Requirements

- **GNOME Shell 45, 46, 47, 48, 49, or 50**
- Wayland or X11
- GDM (optional — for user switching features only)

## Installation

### From Source

```bash
git clone https://github.com/ChathurangaBW/AppMenu.git
cd AppMenu
bash install.sh
```

Then restart GNOME Shell:
- **Wayland**: Log out and back in
- **X11**: Press `Alt+F2`, type `r`, press Enter

### From GNOME Extensions

Install directly from the [GNOME Extensions website](https://extensions.gnome.org/) (coming soon).

## Configuration

Open **Extensions** app or run:

```bash
gnome-extensions prefs appmenu@ChathurangaBW
```

Settings:

| Setting | Description |
|---|---|
| **App Blacklist** | Comma-separated app IDs/names to hide the menu bar |
| **Menu Icon** | Choose from 17 distro icons or the Apple logo; auto-detects by default |
| **Lock to Focused App** | Keep the app name in the panel even when switching windows |
| **Show OS Icon** | Toggle the distro/apple icon next to the system menu |

## Uninstallation

```bash
cd AppMenu
bash uninstall.sh
```

## Project Structure

```
AppMenu/
├── extension.js                 # Entry point — AppMenuExtension class
├── menuManager.js               # Panel menu orchestrator
├── prefs.js                     # Settings UI (Adw)
├── stylesheet.css               # Panel and menu styles (dark theme ready)
├── metadata.json                # GNOME Shell extension metadata
├── recentItemsSubmenu.js        # Recent files/applications submenu
├── userSwitcher.js              # Fast user switching with avatars
├── documentTooltip.js           # Delayed tooltip for document entries
├── schemas/
│   └── org.gnome.shell.extensions.appmenu.gschema.xml
├── actions/
│   ├── dispatcher.js            # Action registry and dispatch
│   ├── windowActions.js         # Window actions
│   ├── fileActions.js           # File/system actions
│   ├── keyboardActions.js       # Virtual keyboard shortcuts
│   ├── viewActions.js           # Nautilus view preferences
│   └── scancodes.js             # Named Linux input scan codes
├── menus/
│   ├── appleMenu.js             # Apple menu (always present)
│   ├── appMenu.js               # Dynamic per-app submenu
│   ├── fileMenu.js              # File menu
│   ├── editMenu.js              # Edit menu
│   ├── viewMenu.js              # View menu
│   ├── goMenu.js                # Go/navigation menu
│   ├── windowMenu.js            # Window management menu
│   └── helpMenu.js              # Help menu
├── icons/                       # 17 Linux distro icons + Apple logo (SVG)
├── install.sh
├── uninstall.sh
└── screenshot.png
```

## License

MIT © ChathurangaBW

---

<div align="center">
  <sub>Built for GNOME. Inspired by macOS.</sub>
</div>
