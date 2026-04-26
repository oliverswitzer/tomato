#!/bin/bash
set -e

APP="release/mac-arm64/Tomato.app"
IDENTITY="${CODESIGN_IDENTITY:-Tomato Dev}"
BUNDLE_ID="com.tomato.pomodoro"

if [ ! -d "$APP" ]; then
  echo "Error: $APP not found"
  exit 1
fi

echo "Signing with identity: $IDENTITY"

for bin in screenpipe ffmpeg ffprobe request-screen-access; do
  if [ -f "$APP/Contents/Resources/$bin" ]; then
    codesign --sign "$IDENTITY" --force --identifier "$BUNDLE_ID" "$APP/Contents/Resources/$bin"
    echo "  Signed $bin"
  fi
done

codesign --sign "$IDENTITY" --force --deep "$APP"
echo "  Signed $APP"
