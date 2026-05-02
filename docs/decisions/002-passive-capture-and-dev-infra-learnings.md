# ADR 002: Passive activity capture via frames table, and dev infrastructure lessons

**Date:** 2026-05-01
**Status:** Accepted

## Context

Tomato was blind to passive consumption. A user could watch YouTube for 20 minutes and the drift detector wouldn't fire because the pipeline only queried `ui_events` for typing and app_switch events. The `frames` table — which captures screen data continuously including during zero-typing periods — was being queried for `browser_url` and `dominantApp` but its `full_text` (OCR'd screen content), `content_hash`, and `capture_trigger` fields were ignored.

User research identified "work that feels productive but doesn't move the business forward" as the #1 enemy, and passive browsing is the most common form.

## Decision

### Passive capture: enrich the existing Haiku call, don't add a new pass

We chose the Tier 1 approach from the IDE-129 research: query the `frames` table for screen text and URLs, feed them as additional context into the existing 60-second batch Haiku call. No new LLM calls, no new infrastructure.

Two codepaths:
1. **Passive-only periods** (no typing/app_switch events): create `passive` timeline entries from frames, grouped by app+window
2. **Mixed periods** (active events exist): enrich existing entries with `passiveContext` (URLs, screen text, click targets) from overlapping frames

We added an anti-hallucination instruction to the prompt ("Do not infer or fabricate video titles, article names, or page content that is not explicitly shown") after observing Haiku hallucinating a video title from insufficient context.

### Why not a two-pass architecture?

The research explored a condensation pass (cheap model every 15s) + drift assessment (Haiku every 60s). Cost analysis showed this is 3x more expensive with Haiku for both passes, and only breaks even if the condensation pass uses a much cheaper model (e.g. gpt-5-nano at $0.05/M input). The single-pass enriched approach costs ~$10/month per user and requires no additional provider dependency.

## Consequences

- Prompt grows from ~200 to ~450 input tokens (+$3/month per user)
- Drift detection now works during passive browsing, reading, video watching
- `TimelineEntry` gains a `passiveContext` field and `passive` event type
- `ScreenpipeDb` interface has two new methods (`getPassiveFrames`, `getClickEvents`)

## Dev infrastructure lessons learned during implementation

These aren't architectural decisions but hard-won fixes that should be documented to prevent recurrence.

### Vite port conflicts with multiple worktrees

**Problem:** `dev.js` hardcoded `VITE_DEV_SERVER_URL=http://localhost:5173`. With multiple git worktrees each running Vite, stale servers would hold port 5173 and Electron would load old code from the wrong worktree. Debugging this was extremely difficult because the app appeared to work but showed stale UI.

**Fix:** `dev.js` now finds a free port via `net.createServer()` before starting Vite, passes it with `--strictPort`. No parsing of Vite output needed.

**Lesson:** Never hardcode dev server ports in multi-worktree setups.

### Tailwind v4 CSS layers

**Problem:** `index.css` had `* { margin: 0; padding: 0; }` outside any `@layer`. Tailwind v4 puts all utilities inside `@layer utilities`. Per CSS spec, unlayered rules always beat layered rules. This silently broke every Tailwind spacing utility (`mb-3`, `p-4`, `gap-2`, etc.) across the entire app.

**Fix:** Removed the manual reset (Tailwind v4 base already includes it) and moved body styles into `@layer base`.

**Lesson:** With Tailwind v4, all custom CSS must go inside `@layer base { }` or it will override utilities.

### Electron macOS window visibility

**Problem:** Opening a debug window worked, but it disappeared when switching to another app via Cmd+Tab. Spent multiple attempts on wrong fixes (`activate` event, `did-become-active`, `skipTaskbar`, `app.show()`, `moveTop()`).

**Root cause:** `setVisibleOnAllWorkspaces()` without `skipTransformProcessType: true` silently converts the app's process type to `UIElementApplication` (background app). macOS doesn't restore normal windows for background apps on activation.

**Fix:** Added `skipTransformProcessType: true` to both `timerWin` and `nudgeWin` `setVisibleOnAllWorkspaces()` calls.

**Lesson:** Research Electron docs (via ctx7 or official docs) before guessing at platform-specific window management fixes. The flag is documented but non-obvious.

### better-sqlite3 ABI mismatch

**Problem:** Running `npm test` rebuilds better-sqlite3 for Node (ABI 137). Running `npm run dev` needs it built for Electron (ABI 145). Developers had to remember to run `npx electron-rebuild` between the two.

**Fix:** Added `predev` script that auto-rebuilds before `npm run dev`.

**Lesson:** Automate environment switches that humans will forget.
