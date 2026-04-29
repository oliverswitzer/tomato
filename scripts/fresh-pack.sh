#!/bin/bash
# Kill, reset, rebuild, and repackage Tomato for testing.
#
# Usage: bash scripts/fresh-pack.sh [flags]
#
# Flags:
#   --keep-credentials  Skip resetting permissions and API key (just rebuild)
#   --clean             Also delete sessions.json and tomato.log
#   --help              Show this help message
#
# Examples:
#   bash scripts/fresh-pack.sh                   # Full onboarding reset + pack
#   bash scripts/fresh-pack.sh --keep-credentials # Rebuild without losing permissions/key
#   bash scripts/fresh-pack.sh --clean            # Nuclear reset — wipe everything + pack

set -e

APP_ID="com.tomato.pomodoro"
DATA_DIR="$HOME/Library/Application Support/tomato"
APP_PATH="/Applications/Tomato.app"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

CLEAN=false
KEEP_CREDENTIALS=false

for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    --keep-credentials) KEEP_CREDENTIALS=true ;;
    --help)
      sed -n '2,/^[^#]/{ /^#/{ s/^# \{0,1\}//; p; }; }' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (try --help)"
      exit 1
      ;;
  esac
done

# Kill running Tomato processes
pkill -f "Tomato.app" 2>/dev/null && echo "  ✓ Killed running Tomato" || true

if [ "$KEEP_CREDENTIALS" = false ]; then
  echo "Resetting credentials and permissions..."

  tccutil reset ScreenCapture "$APP_ID" 2>/dev/null && echo "  ✓ Screen Recording permission reset" || echo "  ✗ Screen Recording reset failed (may need sudo)"
  tccutil reset Accessibility "$APP_ID" 2>/dev/null && echo "  ✓ Accessibility permission reset" || echo "  ✗ Accessibility reset failed (may need sudo)"

  rm -f "$DATA_DIR/api-key.enc" && echo "  ✓ API key removed"
  rm -f "$DATA_DIR/onboarding.json" && echo "  ✓ Onboarding config removed"
else
  echo "Keeping credentials and permissions."
fi

if [ "$CLEAN" = true ]; then
  rm -f "$DATA_DIR/sessions.json" && echo "  ✓ Session history removed"
  rm -f "$DATA_DIR/tomato.log" && echo "  ✓ Log file removed"
fi

# Remove existing app from Applications
if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH" && echo "  ✓ Removed $APP_PATH"
fi

# Ensure bundled binaries are in bin/ for electron-builder
echo ""
if [ -n "$SCREENPIPE_BIN" ] && [ -f "$SCREENPIPE_BIN" ]; then
  mkdir -p "$SCRIPT_DIR/bin"
  cp "$SCREENPIPE_BIN" "$SCRIPT_DIR/bin/screenpipe"
  echo "  ✓ Copied screenpipe from SCREENPIPE_BIN"
elif [ ! -f "$SCRIPT_DIR/bin/screenpipe" ]; then
  echo "  ⚠ No screenpipe binary found. Set SCREENPIPE_BIN or place it in bin/."
  echo "    Sessions will crash without it."
fi

# Rebuild and package
echo ""
echo "Running npm run pack..."
cd "$SCRIPT_DIR"
npm run pack

echo ""
echo "Done. Open Tomato from release/mac-arm64/Tomato.app to test."
