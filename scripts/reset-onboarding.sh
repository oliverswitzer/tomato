#!/bin/bash
# Reset all onboarding state for testing the first-launch flow.
# Usage: bash scripts/reset-onboarding.sh

set -e

APP_ID="com.tomato.pomodoro"
DATA_DIR="$HOME/Library/Application Support/tomato"

echo "Resetting Tomato onboarding state..."

# Reset macOS permissions
tccutil reset ScreenCapture "$APP_ID" 2>/dev/null && echo "  ✓ Screen Recording permission reset" || echo "  ✗ Screen Recording reset failed (may need sudo)"
tccutil reset Accessibility "$APP_ID" 2>/dev/null && echo "  ✓ Accessibility permission reset" || echo "  ✗ Accessibility reset failed (may need sudo)"

# Remove API key and onboarding config
rm -f "$DATA_DIR/api-key.enc" && echo "  ✓ API key removed"
rm -f "$DATA_DIR/onboarding.json" && echo "  ✓ Onboarding config removed"

echo ""
echo "Done. Restart Tomato to see the full onboarding flow."
