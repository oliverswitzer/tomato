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

# 1. Sign ALL Mach-O binaries inside the app (deepest paths first).
#    This catches dylibs, .node modules, helper executables like ShipIt,
#    chrome_crashpad_handler, etc. without relying on filename patterns.
find "$APP" -type f -print0 | while IFS= read -r -d '' f; do
  if file "$f" | grep -q "Mach-O"; then
    codesign "${SIGN_FLAGS[@]}" "$f"
    echo "  Signed ${f#$APP/}"
  fi
done

# 2. Sign framework bundles (creates bundle-level _CodeSignature)
find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.framework" | while read -r f; do
  codesign "${SIGN_FLAGS[@]}" "$f"
  echo "  Signed $(basename "$f")"
done

# 3. Sign helper app bundles (with entitlements)
find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.app" | while read -r f; do
  codesign "${SIGN_FLAGS[@]}" --entitlements "$ENTITLEMENTS" "$f"
  echo "  Signed $(basename "$f")"
done

# 4. Sign top-level app bundle last (with entitlements)
codesign "${SIGN_FLAGS[@]}" --entitlements "$ENTITLEMENTS" "$APP"
echo "  Signed $APP"
