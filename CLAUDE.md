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

### CI / distribution

Release builds use a **Developer ID Application** certificate from the Apple Developer Program. The `build-release.yml` workflow handles certificate import, signing, notarization, and stapling automatically. Required GitHub Actions secrets:

- `APPLE_CERTIFICATE` — base64-encoded .p12 certificate
- `APPLE_CERTIFICATE_PASSWORD` — .p12 password
- `APPLE_ID` — Apple ID email for notarization
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password for notarization
- `APPLE_TEAM_ID` — Apple Developer Team ID

The `scripts/sign.sh` script signs all bundled binaries with `--options runtime --timestamp` (required for notarization) when `CODESIGN_IDENTITY` starts with `"Developer ID"`.

### Local dev

For local builds, a self-signed **"Tomato Dev"** certificate in the login keychain produces a stable signature so macOS permissions (Screen Recording, Accessibility) persist across rebuilds. Ad-hoc signing (`codesign --sign -`) generates a new hash every build, revoking all permissions.

To create the cert (one-time):
1. Keychain Access → Certificate Assistant → Create a Certificate
2. Name: `Tomato Dev`, Self Signed Root, Code Signing
3. Right-click → Get Info → Trust → Code Signing → Always Trust

`scripts/sign.sh` defaults to the `"Tomato Dev"` identity. Override with `CODESIGN_IDENTITY` env var.

To reset permissions for testing:
```bash
tccutil reset ScreenCapture com.tomato.pomodoro
tccutil reset Accessibility com.tomato.pomodoro
```

## API key encryption

The API key is encrypted at rest using AES-256-GCM and stored at `~/Library/Application Support/tomato/api-key.enc`. The encryption key is derived from the machine's hardware UUID (`IOPlatformUUID` via `ioreg`), so the encrypted file is only readable on the same machine.

This deliberately avoids Electron's `safeStorage` API, which uses macOS Keychain internally and triggers a system prompt ("Tomato wants to use your confidential information stored in 'Tomato Safe Storage'") that cannot be suppressed. The crypto-based approach produces zero system dialogs on any launch.

The `ElectronKeychainStore` constructor accepts an optional `machineId` parameter for testing (avoids calling `ioreg` in CI). Users upgrading from an older safeStorage-based build will need to re-enter their API key once.

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

## Renderer state & styling

- **State**: `zustand` store at `src/renderer/store/sessionStore.ts` is the
  single source of truth for session/activity/drift/apiError state pushed
  from the main process over IPC. It's initialized once (`initSessionStore()`
  called from `App.tsx`) and pages read it via selectors
  (`useSessionStore((s) => ...)`) instead of each page subscribing to
  `window.tomato.on*` listeners directly. Purely local/page-specific UI state
  (form inputs, `isExpanded` toggles) stays as component `useState`.
- **Styling**: Tailwind v4, wired via `@tailwindcss/vite` in `vite.config.ts`
  and `@import "tailwindcss";` in `src/renderer/index.css`. All pages use
  Tailwind utility classes on JSX — there are no per-page `.css` files
  anymore. The cream/red editorial palette and serif/mono fonts are Tailwind
  `@theme` tokens in `index.css` (`--color-text/muted/subtle/border/cream/
  accent/accent-dark`, `--font-serif/--font-mono`) rather than hardcoded hex
  values in components.
- **Shared UI components**: `src/renderer/components/ui/` (`Button`, `Card`,
  `Badge`, `ProgressBar`, `IconButton`) — small typed components with
  variant/size props, backed by plain-function class assembly in
  `variants.ts`. Reach for one of these before writing new utility-class
  markup for a pattern that already exists.

## Splash page (Vercel)

The `splash/` directory is deployed to Vercel as a static site. Vercel auto-deploys on push to main and creates preview URLs on PRs.

**After any splash page change:** verify the Vercel deploy succeeded and that the live site matches the design. Check the Vercel preview URL on the PR (posted as a comment by the Vercel bot) or the production URL after merge. Use Chrome DevTools or screenshots to confirm visual correctness.

## Linear project

All issues for this repo belong to the **Tomato** project (ID: `4554e4ee-0cc8-48d6-a8f7-9d1e95b88fa0`) in the **IDE** team (`0a4ce72a-2ad7-4404-b7ed-a2f5dec76ad0`). When creating issues, always set `projectId` to the Tomato project. Never create issues without a project assignment.

## Design references

`*.pen` files are [Pencil](https://pencil.dev/) design documents — a design tool for creating UI mockups and prototypes. When asked to reference designs in a `*.pen` file, always use the `/frontend-design` skill to guide implementation. These files contain design specs that require pixel-perfect, production-grade frontend work.

## Pencil MCP in agent sessions

Pencil MCP works in ao-spawned tmux sessions — it does **not** require a GUI, display variables, or an IDE connection. The MCP server binary (`mcp-server-darwin-arm64` inside Pencil.app) communicates with the Pencil desktop app via a Unix domain socket at `~/.pencil/socket/pencil-desktop.sock`.

**Requirement:** The Pencil desktop app must be running before the agent session starts. If it's not running, the socket won't exist and the MCP server will fail to connect at Claude Code startup, showing as "failed" for the entire session.

**Troubleshooting "failed" Pencil MCP:**
1. Check if Pencil.app is running: `pgrep -f "Pencil.app/Contents/MacOS/Pencil"`
2. Check if the socket exists: `ls ~/.pencil/socket/pencil-desktop.sock`
3. If not running, launch Pencil.app, then restart the Claude Code session (MCP servers connect at startup only)
