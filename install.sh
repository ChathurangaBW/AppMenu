#!/bin/bash

set -euo pipefail

EXTENSION_UUID="appmenu@ChathurangaBW.github.io"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
PREFIX="${PREFIX:-}"
SYSTEM_INSTALL=0

for arg in "$@"; do
    case "$arg" in
        --system)
            SYSTEM_INSTALL=1
            ;;
        --prefix=*)
            PREFIX="${arg#--prefix=}"
            SYSTEM_INSTALL=1
            ;;
        -h|--help)
            cat <<EOF
Usage: ./install.sh [--system] [--prefix=/usr/local]

Default installs to ~/.local/share/gnome-shell/extensions/$EXTENSION_UUID.
Use --system to install to /usr/local/share/gnome-shell/extensions/$EXTENSION_UUID.
Use --prefix=/usr to install to /usr/share/gnome-shell/extensions/$EXTENSION_UUID.
Set DESTDIR for packaging or scratch validation.
EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $arg" >&2
            exit 2
            ;;
    esac
done

if [[ "$SYSTEM_INSTALL" -eq 1 ]]; then
    PREFIX="${PREFIX:-/usr/local}"
    EXTENSION_DIR="${DESTDIR:-}${PREFIX%/}/share/gnome-shell/extensions/$EXTENSION_UUID"
else
    EXTENSION_DIR="${DESTDIR:-}$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
fi

echo "--------------------------------------------------"
echo "Installing AppMenu..."
echo "--------------------------------------------------"

echo "Clearing old structures..."
rm -rf "$EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR"

echo "Copying extension files..."
for item in \
    metadata.json extension.js menuManager.js realMenuManager.js recentItemsSubmenu.js documentTooltip.js \
    userSwitcher.js workspaceIndicator.js searchDialog.js logger.js i18n.js prefs.js stylesheet.css \
    actions menus icons icons.json locale uninstall.sh schemas; do
    cp -rv "$SOURCE_DIR/$item" "$EXTENSION_DIR/"
done

test -f "$EXTENSION_DIR/i18n.js"
test -f "$EXTENSION_DIR/locale/en/LC_MESSAGES/appmenu.mo"

echo "Compiling GSettings schemas..."
glib-compile-schemas "$EXTENSION_DIR/schemas/"

echo "--------------------------------------------------"
echo "Installation complete!"
echo "Restart your desktop session (Logout/Login) to clear cache."
echo "--------------------------------------------------"
