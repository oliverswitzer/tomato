#!/bin/bash
# Reset all onboarding state, rebuild, and repackage for testing.
# Usage: bash scripts/reset-onboarding.sh

set -e

APP_ID="com.tomato.pomodoro"
DATA_DIR="$HOME/Library/Application Support/tomato"
APP_PATH="/Applications/Tomato.app"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Resetting Tomato onboarding state..."

# Kill running Tomato processes
pkill -f "Tomato.app" 2>/dev/null && echo "  ✓ Killed running Tomato" || true

# Reset macOS permissions
tccutil reset ScreenCapture "$APP_ID" 2>/dev/null && echo "  ✓ Screen Recording permission reset" || echo "  ✗ Screen Recording reset failed (may need sudo)"
tccutil reset Accessibility "$APP_ID" 2>/dev/null && echo "  ✓ Accessibility permission reset" || echo "  ✗ Accessibility reset failed (may need sudo)"

# Remove API key and onboarding config
rm -f "$DATA_DIR/api-key.enc" && echo "  ✓ API key removed"
rm -f "$DATA_DIR/onboarding.json" && echo "  ✓ Onboarding config removed"

# Remove existing app from Applications
if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH" && echo "  ✓ Removed $APP_PATH"
fi

# Rebuild and package
echo ""
echo "Running npm run pack..."
cd "$SCRIPT_DIR"
npm run pack

echo ""
echo "Done. Open Tomato from release/mac-arm64/Tomato.app to test the full onboarding flow."
