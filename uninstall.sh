#!/bin/bash

set -euo pipefail

EXTENSION_UUID="appmenu@ChathurangaBW.github.io"
PREFIX="${PREFIX:-}"
SYSTEM_UNINSTALL=0

for arg in "$@"; do
    case "$arg" in
        --system)
            SYSTEM_UNINSTALL=1
            ;;
        --prefix=*)
            PREFIX="${arg#--prefix=}"
            SYSTEM_UNINSTALL=1
            ;;
        -h|--help)
            cat <<EOF
Usage: ./uninstall.sh [--system] [--prefix=/usr/local]

Default removes ~/.local/share/gnome-shell/extensions/$EXTENSION_UUID.
Use --system to remove /usr/local/share/gnome-shell/extensions/$EXTENSION_UUID.
Use --prefix=/usr to remove /usr/share/gnome-shell/extensions/$EXTENSION_UUID.
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

if [[ "$SYSTEM_UNINSTALL" -eq 1 ]]; then
    PREFIX="${PREFIX:-/usr/local}"
    EXTENSION_DIR="${DESTDIR:-}${PREFIX%/}/share/gnome-shell/extensions/$EXTENSION_UUID"
else
    EXTENSION_DIR="${DESTDIR:-}$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
fi

echo "--------------------------------------------------"
echo "Starting uninstallation of AppMenu"
echo "--------------------------------------------------"

echo "Disabling the extension..."
gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true

echo "Deleting extension directory..."
rm -rf "$EXTENSION_DIR"

echo "--------------------------------------------------"
echo "Uninstallation complete!"
echo "--------------------------------------------------"
