#!/bin/bash

set -euo pipefail

EXTENSION_UUID="appmenu@ChathurangaBW.github.io"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
PREFIX="${PREFIX:-}"
SYSTEM_INSTALL=0

CLEAN_STALE=0
for arg in "$@"; do
    case "$arg" in
        --system)
            SYSTEM_INSTALL=1
            ;;
        --prefix=*)
            PREFIX="${arg#--prefix=}"
            SYSTEM_INSTALL=1
            ;;
        --clean-stale)
            CLEAN_STALE=1
            ;;
        -h|--help)
            cat <<EOF
Usage: ./install.sh [--system] [--prefix=/usr/local] [--clean-stale]

Default installs to ~/.local/share/gnome-shell/extensions/$EXTENSION_UUID.
Use --system to install to /usr/local/share/gnome-shell/extensions/$EXTENSION_UUID.
Use --prefix=/usr to install to /usr/share/gnome-shell/extensions/$EXTENSION_UUID.
--clean-stale  automatically remove stale copies in other extension folders.
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

if [[ "$SYSTEM_INSTALL" -eq 1 && -z "${DESTDIR:-}" && "$EUID" -ne 0 ]]; then
    echo "System installs require root privileges. Re-run with sudo or set DESTDIR for packaging." >&2
    exit 1
fi

for item in \
    metadata.json extension.js menuManager.js realMenuManager.js recentItemsSubmenu.js documentTooltip.js \
    userSwitcher.js workspaceIndicator.js searchDialog.js logger.js i18n.js prefs.js prefs.css stylesheet.css \
    actions menus icons icons.json locale uninstall.sh schemas; do
    if [[ ! -e "$SOURCE_DIR/$item" ]]; then
        echo "Required extension file is missing: $SOURCE_DIR/$item" >&2
        exit 1
    fi
done

# Find and warn about stale copies that would shadow this install. Keep all
# candidates under DESTDIR during staged/package installs.
STALE_PATHS=()
DEST_PREFIX="${DESTDIR:-}"
for candidate in \
    "$DEST_PREFIX$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID" \
    "$DEST_PREFIX/usr/local/share/gnome-shell/extensions/$EXTENSION_UUID" \
    "$DEST_PREFIX/usr/share/gnome-shell/extensions/$EXTENSION_UUID"; do
    if [[ "$candidate" != "$EXTENSION_DIR" && -d "$candidate" ]]; then
        STALE_PATHS+=("$candidate")
    fi
done

if (( ${#STALE_PATHS[@]} > 0 )); then
    echo "--------------------------------------------------"
    echo "WARNING: Stale AppMenu copies found outside the target install path."
    echo "GNOME Shell may load the stale copy instead of this one."
    echo
    for p in "${STALE_PATHS[@]}"; do
        if [[ -f "$p/i18n.js" ]]; then
            echo "  PRESENT (has i18n.js)  $p"
        else
            echo "  BROKEN (no i18n.js)   $p  ← will cause 'Unable to load i18n.js' errors"
        fi
    done
    echo
    if [[ "$CLEAN_STALE" -eq 1 ]]; then
        for p in "${STALE_PATHS[@]}"; do
            if [[ "$p" == "$DEST_PREFIX$HOME/.local/"* ]]; then
                echo "Removing stale user copy: $p"
                rm -rf "$p"
            else
                echo "Not removing system copy: $p (use your package manager or remove it manually)" >&2
            fi
        done
        echo "Eligible stale user copies removed."
    else
        echo "Remove them manually:"
        for p in "${STALE_PATHS[@]}"; do
            echo "  sudo rm -rf $p"
        done
        echo
        echo "Or rerun with --clean-stale to remove them automatically."
    fi
    echo "--------------------------------------------------"
fi

echo "--------------------------------------------------"
echo "Installing AppMenu..."
echo "--------------------------------------------------"

STAGING_DIR="${EXTENSION_DIR}.new.$$"
BACKUP_DIR="${EXTENSION_DIR}.backup.$$"
INSTALLED=0

cleanup_failed_install() {
    if [[ "$INSTALLED" -eq 1 ]]; then
        return
    fi
    rm -rf "$STAGING_DIR"
    if [[ -d "$BACKUP_DIR" && ! -e "$EXTENSION_DIR" ]]; then
        mv "$BACKUP_DIR" "$EXTENSION_DIR"
    fi
}
trap cleanup_failed_install EXIT

mkdir -p "$(dirname "$EXTENSION_DIR")"
rm -rf "$STAGING_DIR" "$BACKUP_DIR"
mkdir -p "$STAGING_DIR"

echo "Copying extension files..."
for item in \
    metadata.json extension.js menuManager.js realMenuManager.js recentItemsSubmenu.js documentTooltip.js \
    userSwitcher.js workspaceIndicator.js searchDialog.js logger.js i18n.js prefs.js prefs.css stylesheet.css \
    actions menus icons icons.json locale uninstall.sh schemas; do
    cp -a "$SOURCE_DIR/$item" "$STAGING_DIR/"
done

test -f "$STAGING_DIR/i18n.js"
test -f "$STAGING_DIR/locale/en/LC_MESSAGES/appmenu.mo"

echo "Compiling GSettings schemas..."
glib-compile-schemas "$STAGING_DIR/schemas/"

if [[ -e "$EXTENSION_DIR" ]]; then
    mv "$EXTENSION_DIR" "$BACKUP_DIR"
fi
mv "$STAGING_DIR" "$EXTENSION_DIR"
rm -rf "$BACKUP_DIR"
INSTALLED=1
trap - EXIT

echo "--------------------------------------------------"
echo "Installation complete!"
echo "Restart your desktop session (Logout/Login) to clear cache."
echo "--------------------------------------------------"
