#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/wikarte-webstore"
ZIP_PATH="$DIST_DIR/wikarte-webstore.zip"

INCLUDE_PATHS="
manifest.json
content.js
page-intercept.js
map.html
map.js
styles.css
postcodes.js
icon48.png
icon128.png
lib
LICENSE
THIRD_PARTY_NOTICES.md
"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
mkdir -p "$DIST_DIR"

copy_path() {
  src="$1"
  dst_dir=$(dirname "$STAGE_DIR/$src")
  mkdir -p "$dst_dir"
  cp -R "$ROOT_DIR/$src" "$STAGE_DIR/$src"
}

printf '%s' "$INCLUDE_PATHS" | while read -r path; do
  [ -n "$path" ] || continue
  copy_path "$path"
done

find "$STAGE_DIR" -name '.DS_Store' -delete

rm -f "$ZIP_PATH"
cd "$STAGE_DIR"
zip -qr "$ZIP_PATH" .
printf '%s\n' "$ZIP_PATH"
