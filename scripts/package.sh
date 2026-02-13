#!/usr/bin/env bash
set -euo pipefail

# Package Media Link Saver for Chrome Web Store / GitHub Release
# Usage: bash scripts/package.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read version from manifest.json
VERSION=$(grep '"version"' "$ROOT/manifest.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [[ -z "$VERSION" ]]; then
  echo "❌ Could not read version from manifest.json"
  exit 1
fi

DIST_DIR="$ROOT/dist"
ZIP_NAME="media-link-saver-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

# Clean previous build
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "📦 Packaging Media Link Saver v${VERSION}..."

# Create zip with only extension files
cd "$ROOT"
zip -r "$ZIP_PATH" \
  manifest.json \
  LICENSE \
  README.md \
  background/ \
  content/ \
  icons/ \
  options/ \
  popup/ \
  -x "*.DS_Store" \
  -x "*/__MACOSX/*"

echo ""
echo "✅ Created: dist/$ZIP_NAME"
echo ""

# Show contents
echo "📋 Contents:"
zipinfo -1 "$ZIP_PATH" | sed 's/^/   /'
echo ""

# Show size
SIZE=$(du -h "$ZIP_PATH" | awk '{print $1}')
echo "📏 Size: $SIZE"
