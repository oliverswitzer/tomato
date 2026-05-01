#!/bin/bash
set -e

APP="release/mac-arm64/Tomato.app"
IDENTITY="${CODESIGN_IDENTITY:-Tomato Dev}"
BUNDLE_ID="com.tomato.pomodoro"
ENTITLEMENTS="build/entitlements.mac.plist"

if [ ! -d "$APP" ]; then
  echo "Error: $APP not found"
  exit 1
fi

echo "Signing with identity: $IDENTITY"

SIGN_FLAGS=(--sign "$IDENTITY" --force --identifier "$BUNDLE_ID")

# Developer ID certs require hardened runtime + timestamp for notarization
if [[ "$IDENTITY" == "Developer ID"* ]]; then
  SIGN_FLAGS+=(--options runtime --timestamp)
fi

# Sign all nested code depth-first (innermost before containers).
# Electron apps have dylibs, native modules, helpers, and frameworks
# that must each be signed individually for notarization.

# 1. Shared libraries
find "$APP" -name "*.dylib" | while read -r f; do
  codesign "${SIGN_FLAGS[@]}" "$f"
  echo "  Signed $(basename "$f")"
done

# 2. Native Node modules (better-sqlite3, etc.)
find "$APP" -name "*.node" | while read -r f; do
  codesign "${SIGN_FLAGS[@]}" "$f"
  echo "  Signed $(basename "$f")"
done

# 3. Crashpad handler
find "$APP" -name "chrome_crashpad_handler" | while read -r f; do
  codesign "${SIGN_FLAGS[@]}" "$f"
  echo "  Signed chrome_crashpad_handler"
done

# 4. Helper apps (GPU, Renderer, Plugin helpers)
find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.app" | while read -r f; do
  codesign "${SIGN_FLAGS[@]}" --entitlements "$ENTITLEMENTS" "$f"
  echo "  Signed $(basename "$f")"
done

# 5. Electron Framework
find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.framework" | while read -r f; do
  codesign "${SIGN_FLAGS[@]}" "$f"
  echo "  Signed $(basename "$f")"
done

# 6. Bundled resource binaries
for bin in screenpipe ffmpeg ffprobe request-screen-access; do
  if [ -f "$APP/Contents/Resources/$bin" ]; then
    codesign "${SIGN_FLAGS[@]}" "$APP/Contents/Resources/$bin"
    echo "  Signed $bin"
  fi
done

# 7. Top-level app bundle (signed last, with entitlements)
codesign "${SIGN_FLAGS[@]}" --entitlements "$ENTITLEMENTS" "$APP"
echo "  Signed $APP"
