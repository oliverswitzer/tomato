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

for bin in screenpipe ffmpeg ffprobe request-screen-access; do
  if [ -f "$APP/Contents/Resources/$bin" ]; then
    codesign "${SIGN_FLAGS[@]}" "$APP/Contents/Resources/$bin"
    echo "  Signed $bin"
  fi
done

codesign "${SIGN_FLAGS[@]}" --entitlements "$ENTITLEMENTS" --deep "$APP"
echo "  Signed $APP"
