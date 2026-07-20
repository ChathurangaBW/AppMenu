#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UUID="appmenu@ChathurangaBW"
NAME="AppMenu"
VERSION="$(python3 - <<'PY'
import json
with open('metadata.json') as f:
    print(json.load(f)['version'])
PY
)"
DIST_DIR="$ROOT_DIR/dist"
SCRATCH_DIR="${JCODE_SCRATCH_DIR:-$ROOT_DIR/.scratch}/appmenu-packaging"
EXT_DIR_NAME="$UUID"

mkdir -p "$DIST_DIR" "$SCRATCH_DIR"
rm -rf "$SCRATCH_DIR"/*

cd "$ROOT_DIR"
glib-compile-schemas schemas

SOURCE_ZIP="$DIST_DIR/${NAME}-v${VERSION}.zip"
EXT_ZIP="$DIST_DIR/${UUID}.zip"
RUN_INSTALLER="$DIST_DIR/${NAME}-v${VERSION}-linux.run"
DEB_PATH="$DIST_DIR/${NAME,,}_${VERSION}_all.deb"

rm -f "$SOURCE_ZIP" "$EXT_ZIP" "$RUN_INSTALLER" "$DEB_PATH"

(
  cd "$ROOT_DIR"
  zip -r "$SOURCE_ZIP" . -x '.git/*' '.git' 'dist/*' 'dist' '.scratch/*' '.scratch' >/dev/null
)

mkdir -p "$SCRATCH_DIR/$EXT_DIR_NAME"
rsync -a --exclude='.git' --exclude='dist' --exclude='.scratch' --exclude='scripts' --exclude='.gitignore' "$ROOT_DIR/" "$SCRATCH_DIR/$EXT_DIR_NAME/"
(
  cd "$SCRATCH_DIR"
  zip -r "$EXT_ZIP" "$EXT_DIR_NAME" >/dev/null
)

RUN_STAGE="$SCRATCH_DIR/run-installer"
mkdir -p "$RUN_STAGE/payload/$EXT_DIR_NAME"
rsync -a --exclude='.git' --exclude='dist' --exclude='.scratch' --exclude='scripts' --exclude='.gitignore' "$ROOT_DIR/" "$RUN_STAGE/payload/$EXT_DIR_NAME/"
cat > "$RUN_STAGE/install.sh" <<'SH'
#!/bin/bash
set -euo pipefail
WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT
ARCHIVE_LINE=$(awk '/^__ARCHIVE_BELOW__$/ {print NR + 1; exit 0;}' "$0")
tail -n +"$ARCHIVE_LINE" "$0" | tar -xz -C "$WORKDIR"
bash "$WORKDIR/appmenu@ChathurangaBW/install.sh"
SH
cat "$RUN_STAGE/install.sh" > "$RUN_INSTALLER"
echo '__ARCHIVE_BELOW__' >> "$RUN_INSTALLER"
(
  cd "$RUN_STAGE/payload"
  tar -czf - "$EXT_DIR_NAME"
) >> "$RUN_INSTALLER"
chmod +x "$RUN_INSTALLER"

DEB_ROOT="$SCRATCH_DIR/deb"
INSTALL_ROOT="$DEB_ROOT/usr/share/gnome-shell/extensions/$UUID"
mkdir -p "$DEB_ROOT/DEBIAN" "$INSTALL_ROOT"
rsync -a --exclude='.git' --exclude='dist' --exclude='.scratch' --exclude='scripts' --exclude='.gitignore' "$ROOT_DIR/" "$INSTALL_ROOT/"
cat > "$DEB_ROOT/DEBIAN/control" <<EOF
Package: appmenu
Version: ${VERSION}
Section: gnome
Priority: optional
Architecture: all
Maintainer: ChathurangaBW <ChathurangaBW@users.noreply.github.com>
Depends: gnome-shell, libglib2.0-bin
Description: AppMenu for GNOME Shell
 A macOS-style global menu bar extension for GNOME Shell.
EOF
cat > "$DEB_ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/bash
set -e
if command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas /usr/share/gnome-shell/extensions/appmenu@ChathurangaBW/schemas || true
fi
cat <<MSG
AppMenu installed.
Enable it with:
  gnome-extensions enable appmenu@ChathurangaBW
Then restart GNOME Shell or log out and back in.
MSG
EOF
chmod 0755 "$DEB_ROOT/DEBIAN/postinst"
dpkg-deb --build "$DEB_ROOT" "$DEB_PATH" >/dev/null

printf 'Built artifacts:\n'
ls -lh "$SOURCE_ZIP" "$EXT_ZIP" "$RUN_INSTALLER" "$DEB_PATH"
