# ADR 001: Screenpipe SQLite DB as sole data source

**Date:** 2026-04-25
**Status:** Accepted

## Context

The original pipeline polled screenpipe's HTTP API every 15 seconds for OCR data and ran a separate Swift keylistener binary to capture typed text. This produced noisy, fragmented results — raw OCR dumps of entire screens (including UI chrome, sidebar text, status bars) and half-typed text fragments.

Through exploration of screenpipe's SQLite database (`~/.screenpipe/db.sqlite`), we discovered it already captures everything we need:

- `ui_events` table: typed text, clicks, app switches, clipboard events
- `frames` table: app name, window title, timestamps per screen capture
- `elements` table: accessibility tree (AXHeading, AXTextField, etc.)

A cross-reference query joining typed text events with frame timestamps gives us a complete activity timeline: what was typed, in which app, at what time.

We also contributed a patch to screenpipe (PR #3073) to populate `app_name` and `window_title` directly on text events, eliminating the need for the fuzzy timestamp join.

## Decision

Read screenpipe's SQLite DB directly (readonly) instead of using the HTTP API or a custom keylistener. The database is the single source of truth for all user activity data.

## Consequences

- **Removed**: screenpipe HTTP client, poll-ticker, text-buffer, behavior-event-emitter, keylistener binary
- **Added**: `screenpipe-db.ts` (SQLite client via `better-sqlite3`), `timeline-builder.ts`
- No network dependency for data collection — just filesystem access to `~/.screenpipe/db.sqlite`
- Depends on screenpipe recording to the same DB path (always `~/.screenpipe/`)
- `better-sqlite3` is a native module requiring `electron-rebuild` for the packaged app
- The patched screenpipe binary is required for `app_name` on text events; falls back to a cross-reference join with the unpatched binary
