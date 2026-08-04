#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UUID="appmenu@ChathurangaBW.github.io"
NAME="AppMenu"
VERSION="${APPMENU_VERSION:-5.6.2}"
DIST_DIR="$ROOT_DIR/dist"
SCRATCH_DIR="${JCODE_SCRATCH_DIR:-$ROOT_DIR/.scratch}/appmenu-packaging"
EXT_DIR_NAME="$UUID"
EGO_ZIP="$DIST_DIR/${NAME}-e.g.o-upload-v${VERSION}.zip"
SOURCE_ZIP="$DIST_DIR/${NAME}-v${VERSION}.zip"
EXT_ZIP="$DIST_DIR/${UUID}.zip"
RUN_INSTALLER="$DIST_DIR/${NAME}-v${VERSION}-linux.run"
BIN_INSTALLER="$DIST_DIR/${NAME}-v${VERSION}-linux.bin"
DEB_PATH="$DIST_DIR/${NAME,,}_${VERSION}_all.deb"
CHECKSUMS="$DIST_DIR/${NAME}-v${VERSION}-SHA256SUMS.txt"
SOURCE_STAGE="$SCRATCH_DIR/source"
RUNTIME_STAGE="$SCRATCH_DIR/runtime/$EXT_DIR_NAME"

# Keep release payloads constrained to files that GNOME Shell can load. Do not
# package arbitrary workspace content such as handoff notes or other projects.
RUNTIME_ITEMS=(
  metadata.json extension.js menuManager.js realMenuManager.js recentItemsSubmenu.js documentTooltip.js
  userSwitcher.js workspaceIndicator.js searchDialog.js logger.js i18n.js prefs.js prefs.css stylesheet.css
  icons.json actions menus icons locale install.sh uninstall.sh schemas README.md LICENSE
)

copy_runtime() {
  local destination="$1"
  mkdir -p "$destination"

  for item in "${RUNTIME_ITEMS[@]}"; do
    test -e "$ROOT_DIR/$item"
    cp -a "$ROOT_DIR/$item" "$destination/"
  done
}

assert_no_contamination() {
  local archive="$1"
  local path

  while IFS= read -r path; do
    case "$path" in
      *'/dock/'*|*'/vendor/'*|*'/HANDOFF.md'|*'/.scratch/'*|*'/.git/'*)
        echo "Refusing contaminated artifact $archive: $path" >&2
        return 1
        ;;
    esac
  done < <(unzip -Z1 "$archive")
}

mkdir -p "$DIST_DIR" "$SCRATCH_DIR"
rm -rf "$SCRATCH_DIR"/*
cd "$ROOT_DIR"
if [[ "${APPMENU_ALLOW_DIRTY:-0}" != 1 ]] && (! git diff --quiet || ! git diff --cached --quiet); then
  echo "Refusing to package uncommitted tracked changes. Set APPMENU_ALLOW_DIRTY=1 for local development builds." >&2
  exit 1
fi

glib-compile-schemas schemas
bash ./build-locale.sh compile
rm -f "$EGO_ZIP" "$SOURCE_ZIP" "$EXT_ZIP" "$RUN_INSTALLER" "$BIN_INSTALLER" "$DEB_PATH" "$CHECKSUMS"

# Source snapshot for GitHub releases. The tracked-file manifest excludes
# generated artifacts and all untracked workspace files.
mkdir -p "$SOURCE_STAGE"
git ls-files -z -- ':!dist/**' | rsync -a --from0 --files-from=- "$ROOT_DIR/" "$SOURCE_STAGE/"
(cd "$SOURCE_STAGE" && zip -qr "$SOURCE_ZIP" .)

# Minimal extensions.gnome.org upload zip: extension files at archive root
# NOTE: gschemas.compiled intentionally omitted for the e.g.o upload package.
zip -r "$EGO_ZIP" \
  metadata.json extension.js menuManager.js realMenuManager.js recentItemsSubmenu.js documentTooltip.js \
  userSwitcher.js workspaceIndicator.js searchDialog.js logger.js i18n.js prefs.js prefs.css stylesheet.css \
  icons.json actions menus icons locale \
  schemas/org.gnome.shell.extensions.appmenu.gschema.xml >/dev/null

# Manual install zip: one top-level UUID directory
copy_runtime "$RUNTIME_STAGE"
(cd "$SCRATCH_DIR/runtime" && zip -qr "$EXT_ZIP" "$EXT_DIR_NAME")
assert_no_contamination "$EXT_ZIP"

# One-shot self-extracting installer
RUN_STAGE="$SCRATCH_DIR/run-installer"
copy_runtime "$RUN_STAGE/payload/$EXT_DIR_NAME"
cat > "$RUN_STAGE/install.sh" <<'SH'
#!/bin/bash
set -euo pipefail
WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT
ARCHIVE_LINE=$(awk '/^__ARCHIVE_BELOW__$/ {print NR + 1; exit 0;}' "$0")
tail -n +"$ARCHIVE_LINE" "$0" | tar -xz -C "$WORKDIR"
bash "$WORKDIR/appmenu@ChathurangaBW.github.io/install.sh"
exit 0
SH
cat "$RUN_STAGE/install.sh" > "$RUN_INSTALLER"
echo '__ARCHIVE_BELOW__' >> "$RUN_INSTALLER"
(cd "$RUN_STAGE/payload" && tar -czf - "$EXT_DIR_NAME") >> "$RUN_INSTALLER"
chmod +x "$RUN_INSTALLER"
cp "$RUN_INSTALLER" "$BIN_INSTALLER"
chmod +x "$BIN_INSTALLER"

# Debian/Ubuntu package
DEB_ROOT="$SCRATCH_DIR/deb"
INSTALL_ROOT="$DEB_ROOT/usr/share/gnome-shell/extensions/$UUID"
mkdir -p "$DEB_ROOT/DEBIAN" "$INSTALL_ROOT"
copy_runtime "$INSTALL_ROOT"
cat > "$DEB_ROOT/DEBIAN/control" <<EOF
Package: appmenu
Version: ${VERSION}
Section: gnome
Priority: optional
Architecture: all
Maintainer: ChathurangaBW <ChathurangaBW@users.noreply.github.com>
Depends: gnome-shell, libglib2.0-bin
Description: AppMenu for GNOME Shell
 A zero-dependency macOS-style global menu bar extension for GNOME Shell.
EOF
cat > "$DEB_ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/bash
set -e
if command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas /usr/share/gnome-shell/extensions/appmenu@ChathurangaBW.github.io/schemas
fi
cat <<MSG
AppMenu installed.
Enable it with:
  gnome-extensions enable appmenu@ChathurangaBW.github.io
Then restart GNOME Shell or log out and back in.
MSG
EOF
chmod 0755 "$DEB_ROOT/DEBIAN/postinst"
dpkg-deb --build "$DEB_ROOT" "$DEB_PATH" >/dev/null

assert_no_contamination "$SOURCE_ZIP"
assert_no_contamination "$EGO_ZIP"
(
  cd "$DIST_DIR"
  sha256sum "$(basename "$EGO_ZIP")" "$(basename "$SOURCE_ZIP")" "$(basename "$EXT_ZIP")" \
    "$(basename "$RUN_INSTALLER")" "$(basename "$BIN_INSTALLER")" "$(basename "$DEB_PATH")" > "$CHECKSUMS"
)

printf 'Built artifacts:
'
ls -lh "$EGO_ZIP" "$SOURCE_ZIP" "$EXT_ZIP" "$RUN_INSTALLER" "$BIN_INSTALLER" "$DEB_PATH" "$CHECKSUMS"
