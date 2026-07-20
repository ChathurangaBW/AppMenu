# AppMenu

<div align="center">

**A macOS-style global menu bar for GNOME Shell**

[![GNOME](https://img.shields.io/badge/GNOME-45%E2%80%9350-blue?logo=gnome)](https://www.gnome.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3-orange)](metadata.json)

</div>

<p align="center">
  <img src="screenshot.png" alt="AppMenu screenshot" width="900" />
</p>

AppMenu brings a clean macOS-style menu bar to the GNOME top panel. It adds an Apple menu, app-aware menus, window controls, quick navigation, keyboard shortcuts, and fast user switching in one lightweight GNOME Shell extension.

## Highlights

- macOS-style top panel menu experience for GNOME
- Apple menu with system actions and recent items
- Dynamic app menu based on the focused window
- File, Edit, View, Go, Window, and Help menus
- Fast user switching with avatars and session badges
- Configurable distro icon or Apple logo
- GNOME Shell 45 to 50 support

## Features

### Apple Menu

The leftmost menu provides quick access to:

- About This Computer
- System Settings
- Recent Items
- Force Quit
- Sleep
- Restart
- Shut Down
- Lock Screen
- Log Out

### Global Menu Bar

| Menu | What it includes |
|---|---|
| **App** | About, Hide, Hide Others, Show All, Quit, open windows list |
| **File** | New Folder, Open, Save, Rename, Print, Eject, Connect to Server |
| **Edit** | Undo, Redo, Cut, Copy, Paste, Select All, Emoji & Symbols |
| **View** | Show Hidden Files, Reload, icon size controls, sort options |
| **Go** | Back, Forward, Recents, Documents, Desktop, Downloads, Home, Computer |
| **Window** | Minimize, Maximize, Close, Full Screen, Tile Left, Tile Right, Show All, Bring All to Front, Zoom |
| **Help** | Help, App Details, Report an Issue |

### Fast User Switching

- User avatars in the right side of the panel
- Session badges for logged-in users
- Quick switching between user sessions
- GDM support for login-window access where available

### Context-Aware Behavior

- Shows the focused application's name in the panel
- Rebuilds menus when focus changes
- Adds an open windows section when an app has multiple windows
- Supports app blacklisting to suppress the menu for selected apps

### Keyboard Shortcuts

The Edit menu sends real keyboard events through `Clutter.InputDevice`, so shortcuts work across many GTK, Electron, browser, and terminal apps.

Supported shortcuts:

- `Ctrl+C` Copy
- `Ctrl+V` Paste
- `Ctrl+X` Cut
- `Ctrl+Z` Undo
- `Ctrl+Shift+Z` Redo
- `Ctrl+A` Select All
- `Ctrl+Shift+E` Emoji picker

## Performance

AppMenu is designed to stay lightweight:

- Debounced focus events to avoid rebuild storms during rapid window switching
- Reuse of existing panel widgets instead of recreating them repeatedly
- Cached static menu definitions for lower overhead
- Cached blacklist lookups for fast filtering
- Cached virtual keyboard device for shortcut actions

## Requirements

- GNOME Shell 45, 46, 47, 48, 49, or 50
- Wayland or X11
- GDM is optional and only affects some user-switching features

## Installation

### Quick Packages

You can install AppMenu using release artifacts:

- **`appmenu@ChathurangaBW.zip`**: extension package for manual GNOME Shell installation
- **`AppMenu-v3-linux.run`** or **`AppMenu-v3-linux.bin`**: one-shot self-extracting installer
- **`appmenu_3_all.deb`**: Debian and Ubuntu package

### From Source

```bash
git clone https://github.com/ChathurangaBW/AppMenu.git
cd AppMenu
bash install.sh
```

Then restart GNOME Shell:

- **Wayland:** log out and log back in
- **X11:** press `Alt+F2`, type `r`, then press Enter

## Configuration

Open the extension preferences with:

```bash
gnome-extensions prefs appmenu@ChathurangaBW
```

Available settings:

| Setting | Description |
|---|---|
| **App Blacklist** | Hide the menu bar for specific apps by name or ID |
| **Menu Icon** | Select a distro icon or the Apple logo |
| **Lock to Focused App** | Keep the panel app label tied to the focused app |
| **Show OS Icon** | Toggle the icon shown near the Apple menu |

## Uninstallation

```bash
cd AppMenu
bash uninstall.sh
```

## Project Structure

```text
AppMenu/
├── extension.js                 # Extension entry point
├── menuManager.js               # Panel menu orchestration
├── prefs.js                     # Preferences window
├── stylesheet.css               # Extension styling
├── metadata.json                # Extension metadata
├── recentItemsSubmenu.js        # Recent items submenu
├── userSwitcher.js              # Fast user switching UI
├── documentTooltip.js           # Tooltip support for recent items
├── schemas/
│   └── org.gnome.shell.extensions.appmenu.gschema.xml
├── actions/
│   ├── dispatcher.js            # Action dispatch layer
│   ├── fileActions.js           # File and system actions
│   ├── keyboardActions.js       # Shortcut simulation
│   ├── scancodes.js             # Input scan code constants
│   ├── viewActions.js           # View-related actions
│   └── windowActions.js         # Window management actions
├── menus/
│   ├── appleMenu.js             # Apple menu definition
│   ├── appMenu.js               # Dynamic app menu
│   ├── editMenu.js              # Edit menu
│   ├── fileMenu.js              # File menu
│   ├── goMenu.js                # Go menu
│   ├── helpMenu.js              # Help menu
│   ├── viewMenu.js              # View menu
│   └── windowMenu.js            # Window menu
├── icons/                       # SVG icons
├── install.sh                   # Install helper
├── uninstall.sh                 # Uninstall helper
└── screenshot.png               # README screenshot
```

## License

MIT © ChathurangaBW

<div align="center">
  <sub>Built for GNOME. Inspired by macOS.</sub>
</div>
