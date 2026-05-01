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

BASE_FLAGS=(--sign "$IDENTITY" --force)

# Developer ID certs require hardened runtime + timestamp for notarization
if [[ "$IDENTITY" == "Developer ID"* ]]; then
  BASE_FLAGS+=(--options runtime --timestamp)
fi

# 1. Sign ALL Mach-O binaries inside the app (deepest paths first).
#    Standalone binaries get an explicit identifier; binaries inside
#    bundles will be re-signed when their parent bundle is signed.
find "$APP" -type f -print0 | while IFS= read -r -d '' f; do
  if file "$f" | grep -q "Mach-O"; then
    codesign "${BASE_FLAGS[@]}" --identifier "$BUNDLE_ID" "$f"
    echo "  Signed ${f#$APP/}"
  fi
done

# 2. Sign framework bundles (identifier derived from their own Info.plist)
find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.framework" | while read -r f; do
  codesign "${BASE_FLAGS[@]}" "$f"
  echo "  Signed $(basename "$f")"
done

# 3. Sign helper app bundles (identifier derived from their own Info.plist)
find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.app" | while read -r f; do
  codesign "${BASE_FLAGS[@]}" --entitlements "$ENTITLEMENTS" "$f"
  echo "  Signed $(basename "$f")"
done

# 4. Sign top-level app bundle last (with entitlements)
codesign "${BASE_FLAGS[@]}" --entitlements "$ENTITLEMENTS" "$APP"
echo "  Signed $APP"
