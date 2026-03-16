#!/usr/bin/env bash
# generate-icons.sh
# Converts public/icon.svg to the platform-specific icon formats required by electron-builder.
# Requires: Inkscape (or rsvg-convert) and ImageMagick (convert/magick).
# Run from the apps/desktop directory: bash scripts/generate-icons.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC="$SCRIPT_DIR/../public"
SVG="$PUBLIC/icon.svg"

if [ ! -f "$SVG" ]; then
  echo "ERROR: $SVG not found"
  exit 1
fi

echo "Generating PNG sizes..."

# Use Inkscape if available, otherwise rsvg-convert, otherwise ImageMagick
render_png() {
  local size=$1
  local out=$2
  if command -v inkscape &>/dev/null; then
    inkscape --export-type=png --export-width="$size" --export-height="$size" --export-filename="$out" "$SVG" 2>/dev/null
  elif command -v rsvg-convert &>/dev/null; then
    rsvg-convert -w "$size" -h "$size" -o "$out" "$SVG"
  else
    convert -background none -resize "${size}x${size}" "$SVG" "$out"
  fi
}

render_png 1024 "$PUBLIC/icon-1024.png"
render_png 512  "$PUBLIC/icon-512.png"
render_png 256  "$PUBLIC/icon-256.png"
render_png 128  "$PUBLIC/icon-128.png"
render_png 64   "$PUBLIC/icon-64.png"
render_png 32   "$PUBLIC/icon-32.png"
render_png 16   "$PUBLIC/icon-16.png"

# Linux: use 512px PNG
cp "$PUBLIC/icon-512.png" "$PUBLIC/icon.png"
echo "  icon.png (Linux) ✓"

# Windows: multi-size ICO
if command -v convert &>/dev/null || command -v magick &>/dev/null; then
  CONVERT_CMD="convert"
  command -v magick &>/dev/null && CONVERT_CMD="magick"
  $CONVERT_CMD "$PUBLIC/icon-16.png" "$PUBLIC/icon-32.png" "$PUBLIC/icon-64.png" \
    "$PUBLIC/icon-128.png" "$PUBLIC/icon-256.png" "$PUBLIC/icon.ico"
  echo "  icon.ico (Windows) ✓"
else
  echo "  WARN: ImageMagick not found — icon.ico not generated. Install ImageMagick and re-run."
fi

# macOS: .icns via iconutil (macOS only)
if command -v iconutil &>/dev/null; then
  ICONSET="$PUBLIC/icon.iconset"
  mkdir -p "$ICONSET"
  cp "$PUBLIC/icon-16.png"   "$ICONSET/icon_16x16.png"
  cp "$PUBLIC/icon-32.png"   "$ICONSET/icon_16x16@2x.png"
  cp "$PUBLIC/icon-32.png"   "$ICONSET/icon_32x32.png"
  cp "$PUBLIC/icon-64.png"   "$ICONSET/icon_32x32@2x.png"
  cp "$PUBLIC/icon-128.png"  "$ICONSET/icon_128x128.png"
  cp "$PUBLIC/icon-256.png"  "$ICONSET/icon_128x128@2x.png"
  cp "$PUBLIC/icon-256.png"  "$ICONSET/icon_256x256.png"
  cp "$PUBLIC/icon-512.png"  "$ICONSET/icon_256x256@2x.png"
  cp "$PUBLIC/icon-512.png"  "$ICONSET/icon_512x512.png"
  cp "$PUBLIC/icon-1024.png" "$ICONSET/icon_512x512@2x.png"
  iconutil -c icns "$ICONSET" -o "$PUBLIC/icon.icns"
  rm -rf "$ICONSET"
  echo "  icon.icns (macOS) ✓"
else
  echo "  INFO: iconutil not found (macOS only) — icon.icns not generated."
fi

# Clean up intermediate PNGs
rm -f "$PUBLIC/icon-1024.png" "$PUBLIC/icon-512.png" "$PUBLIC/icon-256.png" \
      "$PUBLIC/icon-128.png" "$PUBLIC/icon-64.png" "$PUBLIC/icon-32.png" "$PUBLIC/icon-16.png"

echo "Done. Icons written to $PUBLIC/"
