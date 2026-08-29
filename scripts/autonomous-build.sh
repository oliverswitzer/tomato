#!/usr/bin/env bash
# Overnight build driver for tomato UI modernization (Tailwind + Zustand).
set -uo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"

export PATH="$HOME/.asdf/shims:$HOME/.local/bin:$REPO/node_modules/.bin:$PATH"

PROMPT_FILE="$REPO/.build-continuation-prompt.md"
LOG_DIR="$REPO/.build-logs"
VERIFY_PORT=5173
mkdir -p "$LOG_DIR"

UNITS=(
  "U01 zustand session store"
  "U02 migrate remaining pages onto the store"
  "U03 reusable tailwind ui components"
  "U04 migrate HudPage to tailwind"
  "U05 migrate StartPage to tailwind"
  "U06 migrate NudgePage to tailwind"
  "U07 migrate SettingsPage to tailwind"
  "U08 migrate ApiKeyPage + PermissionsPage to tailwind"
  "U09 migrate DebugDashboard to tailwind"
  "U10 dead code + lint pass"
  "U11 docs + final verify"
)

is_done() { grep -qF "✅ $1" "$REPO/STATUS.md" 2>/dev/null; }

verify_green() {
  lsof -ti:"$VERIFY_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 1
  ( cd "$REPO" && npm run verify >"$LOG_DIR/verify_last.log" 2>&1 )
}

echo "=== Driver started $(date) ===" | tee -a "$LOG_DIR/driver.log"

for unit in "${UNITS[@]}"; do
  if is_done "$unit"; then
    echo "[skip] $unit already done" | tee -a "$LOG_DIR/driver.log"
    continue
  fi

  ts="$(date +%Y%m%d_%H%M%S)"
  slug="$(echo "$unit" | awk '{print $1}')"
  runlog="$LOG_DIR/${slug}_${ts}.log"
  echo "[run] $unit at $(date +%H:%M:%S) -> $runlog" | tee -a "$LOG_DIR/driver.log"

  prompt="$(cat "$PROMPT_FILE")

## THIS RUN

Implement unit '$unit' from PLAN.md. It is the next unit not marked done in
STATUS.md. Implement it completely, get \`npm run verify\` to exit 0, update
STATUS.md honestly, commit, then stop. Do not start any other unit."

  hermes chat --yolo -Q \
    -t terminal,file,code_execution,browser,vision,skills,todo,web \
    --max-turns 400 \
    -q "$prompt" >"$runlog" 2>&1
  rc=$?
  echo "[exit] $unit exit=$rc" | tee -a "$LOG_DIR/driver.log"

  if verify_green; then
    echo "[green] after $unit" | tee -a "$LOG_DIR/driver.log"
    ( cd "$REPO" && git push origin HEAD >/dev/null 2>&1 )
  else
    echo "[RED] tree not green after $unit — stopping" | tee -a "$LOG_DIR/driver.log"
    tail -30 "$LOG_DIR/verify_last.log" | tee -a "$LOG_DIR/driver.log"
    break
  fi
done

echo "=== Driver finished $(date) ===" | tee -a "$LOG_DIR/driver.log"
