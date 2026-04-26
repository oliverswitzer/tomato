# Tomato

Pomodoro timer for macOS with screen-reading focus tracking. Uses [screenpipe](https://github.com/screenpipe/screenpipe) to observe what you're doing and an LLM to detect when you drift from your intention.

## How it works

1. Set an intention ("Ship the pricing page rewrite") and a timer (15/25/45/60 min)
2. Screenpipe records your screen activity in the background
3. Every 15 seconds, the app queries screenpipe's SQLite database for typed text, app switches, and accessibility data
4. Every 3 minutes, a single Claude Haiku call summarizes your activity, classifies it, and checks if you've drifted
5. If you're off track, a gentle nudge appears asking you to refocus or pause

At the end of the session, the LLM summarizes what you accomplished and gives a focus score (0–100%).

## Prerequisites

- macOS (Apple Silicon)
- Node.js 22+
- [Patched screenpipe binary](https://github.com/screenpipe/screenpipe/pull/3073) — populates `app_name` on text events
- `ANTHROPIC_API_KEY` environment variable set

## Setup

```bash
cd pomodoro
npm install

# Copy the patched screenpipe binary
cp /path/to/screenpipe/target/release/screenpipe bin/screenpipe

# Rebuild better-sqlite3 for Electron
npx electron-rebuild
```

## Development

```bash
npm run dev
```

Starts Vite dev server + Electron with hot reload. Set `SCREENPIPE_BIN` to use a custom screenpipe binary:

```bash
SCREENPIPE_BIN=/path/to/screenpipe npm run dev
```

The debug dashboard is available from the tray menu (dev mode only).

## Testing

```bash
npm test              # Run all tests (51 tests)
npm run typecheck     # TypeScript type checking
```

## Building

```bash
npm run pack          # Build .app (for local testing)
npm run dist          # Build .dmg (for distribution)
```

Output goes to `release/`. The build:
- Compiles TypeScript (main + renderer)
- Rebuilds `better-sqlite3` for Electron's ABI
- Packages with electron-builder
- Ad-hoc code signs (no Apple Developer account needed)
- Bundles the screenpipe binary from `bin/`

## Architecture

```
Screenpipe DB (~/.screenpipe/db.sqlite, readonly)
│
├── 15s tick: query text events + frames → live timeline on debug dashboard
│
└── 3 min batch: query full window → one Claude Haiku call
    ├── Summary + Level 2 classification + drift assessment
    └── If drifting → nudge window
```

Key modules:
- `screenpipe-db.ts` — SQLite client reading screenpipe's database
- `timeline-builder.ts` — assembles activity timeline from DB queries, collapses consecutive typing in same app/window
- `llm-summarizer.ts` — structured Claude Haiku calls for batch summarization and session summaries
- `focus-tracker.ts` — orchestrator with two timers (15s tick, 3min batch)

## Project structure

```
src/
  main/           # Electron main process
  renderer/       # React + Tailwind UI
  preload/        # IPC bridge
  shared/         # Types and utilities
```
