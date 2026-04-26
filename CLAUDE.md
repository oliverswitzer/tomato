# CLAUDE.md

## Dev setup

- **Node 22+**, **npm** for package management
- `npm run dev` — Vite dev server + Electron with hot reload
- `npm test` — vitest (55 tests)
- `npm run typecheck` — TypeScript checking for main + renderer
- `npm run pack` — build + package + sign (.app in `release/`)
- `npm run dist` — build + package + sign (.dmg in `release/`)

## Screenpipe dependency

We use a **patched screenpipe binary** (PR #3073) that populates `app_name` and `window_title` on text events in `ui_events`. The npm-packaged `@screenpipe/cli-darwin-arm64` binary does NOT have this patch.

To use the patched binary:
```bash
# Option 1: env var
SCREENPIPE_BIN=/path/to/screenpipe/target/release/screenpipe npm run dev

# Option 2: copy to bin/ (used by pack/dist)
cp /path/to/screenpipe/target/release/screenpipe bin/screenpipe
```

The binary resolves in this order: `SCREENPIPE_BIN` env → `Contents/Resources/screenpipe` (packaged) → `bin/screenpipe` (local dev) → npm package (fallback, unpatched).

## better-sqlite3 ABI conflict

`better-sqlite3` is a native module. Tests run on Node (ABI 137), the packaged app runs on Electron (ABI 145). These are incompatible.

- `npm test` leaves the module built for Node
- `npm run pack` runs `electron-rebuild` before `electron-builder` to fix this
- If you get `NODE_MODULE_VERSION` errors, run `npx electron-rebuild`
- The test suite uses a mock `SqliteDatabase` interface (dependency injection) so it never loads the real native module

## Code signing

macOS permissions (Screen Recording, Accessibility) are tied to the app's code signature hash. **Ad-hoc signing (`codesign --sign -`) generates a new hash every build, revoking all permissions.**

We use a self-signed certificate called **"Tomato Dev"** in the login keychain. This produces a stable signature so permissions persist across rebuilds.

To create the cert (one-time):
1. Keychain Access → Certificate Assistant → Create a Certificate
2. Name: `Tomato Dev`, Self Signed Root, Code Signing
3. Right-click → Get Info → Trust → Code Signing → Always Trust

The `scripts/sign.sh` script signs all bundled binaries with the same `com.tomato.pomodoro` identifier. The pack script calls it automatically.

To reset permissions for testing:
```bash
tccutil reset ScreenCapture com.tomato.pomodoro
tccutil reset Accessibility com.tomato.pomodoro
```

## ANTHROPIC_API_KEY

The packaged app does NOT bundle an API key. macOS apps launched from Finder don't inherit shell environment variables.

For dev/testing, launch from terminal:
```bash
ANTHROPIC_API_KEY=sk-... ./release/mac-arm64/Tomato.app/Contents/MacOS/Tomato
```

Or use `npm run dev` which inherits your shell's env vars.

Before distribution, a proxy server is required — embedding the key in the app binary is not secure.

## Bundled binaries

The packaged app bundles these in `Contents/Resources/` (sourced from `bin/`):
- `screenpipe` — patched screen recorder (36MB)
- `ffmpeg` — required by screenpipe for video processing (412KB)
- `ffprobe` — required by screenpipe alongside ffmpeg (344KB)
- `request-screen-access` — Swift helper calling `CGRequestScreenCaptureAccess` to register in macOS privacy settings

All are in `.gitignore` — not committed to the repo.

## Architecture

```
Screenpipe DB (~/.screenpipe/db.sqlite, readonly)
  → 15s tick: query text events + frames → live timeline on debug dashboard
  → 3 min batch: query full window → one Claude Haiku call → summary + classification + drift
```

Key modules:
- `screenpipe-db.ts` — SQLite client (injectable `SqliteDatabase` interface)
- `timeline-builder.ts` — assembles timeline, collapses consecutive typing in same app/window
- `llm-summarizer.ts` — batch summarization + session summary with focus score
- `focus-tracker.ts` — orchestrator with two timers
