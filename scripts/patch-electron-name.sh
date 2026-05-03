#!/bin/bash
# Patch Electron.app's Info.plist so macOS menu bar shows "Tomato" in dev mode.
# Runs as a postinstall hook — re-applies after every npm install.

PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"

if [ -f "$PLIST" ]; then
  plutil -replace CFBundleName -string "Tomato" "$PLIST"
  plutil -replace CFBundleDisplayName -string "Tomato" "$PLIST"
  echo "Patched Electron.app Info.plist → Tomato"
fi
