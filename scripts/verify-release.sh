#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:?Usage: scripts/verify-release.sh VERSION}"
DIST_DIR="$ROOT_DIR/dist"
UUID="appmenu@ChathurangaBW.github.io"
NAME="AppMenu"

EGO_ZIP="$DIST_DIR/${NAME}-e.g.o-upload-v${VERSION}.zip"
SOURCE_ZIP="$DIST_DIR/${NAME}-v${VERSION}.zip"
EXT_ZIP="$DIST_DIR/${UUID}.zip"
RUN_INSTALLER="$DIST_DIR/${NAME}-v${VERSION}-linux.run"
BIN_INSTALLER="$DIST_DIR/${NAME}-v${VERSION}-linux.bin"
DEB_PATH="$DIST_DIR/${NAME,,}_${VERSION}_all.deb"
CHECKSUMS="$DIST_DIR/${NAME}-v${VERSION}-SHA256SUMS.txt"

for artifact in "$EGO_ZIP" "$SOURCE_ZIP" "$EXT_ZIP" "$RUN_INSTALLER" "$BIN_INSTALLER" "$DEB_PATH" "$CHECKSUMS"; do
  test -f "$artifact"
done

glib-compile-schemas --strict "$ROOT_DIR/schemas"
bash -n "$ROOT_DIR/install.sh" "$ROOT_DIR/uninstall.sh" "$ROOT_DIR/build-locale.sh" "$ROOT_DIR/scripts/build-packages.sh"

if grep -R --include='*.js' -n 'call_sync' "$ROOT_DIR" --exclude-dir=.git --exclude-dir=dist; then
  echo 'Synchronous D-Bus calls are forbidden in AppMenu runtime code.' >&2
  exit 1
fi

unzip -t "$EGO_ZIP" >/dev/null
unzip -t "$SOURCE_ZIP" >/dev/null
unzip -t "$EXT_ZIP" >/dev/null
dpkg-deb --info "$DEB_PATH" >/dev/null

while IFS= read -r path; do
  case "$path" in
    "$UUID"/|"$UUID"/*) ;;
    *) echo "Unexpected manual ZIP path: $path" >&2; exit 1 ;;
  esac
  case "$path" in
    *'/dock/'*|*'/vendor/'*|*'/HANDOFF.md'|*'/.scratch/'*|*'/.git/'*)
      echo "Contaminated manual ZIP path: $path" >&2
      exit 1
      ;;
  esac
done < <(unzip -Z1 "$EXT_ZIP")

while IFS= read -r path; do
  case "$path" in
    dist/*|HANDOFF.md|.scratch/*|.git/*)
      echo "Contaminated source ZIP path: $path" >&2
      exit 1
      ;;
  esac
done < <(unzip -Z1 "$SOURCE_ZIP")

(
  cd "$DIST_DIR"
  sha256sum --check "$(basename "$CHECKSUMS")"
)

echo "Release verification passed for v${VERSION}."
