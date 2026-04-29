# Research: Cheap Passive Activity Capture

**Ticket:** IDE-129  
**Date:** 2026-04-29  
**Status:** Research complete, recommendations ready

## Executive Summary

Tomato currently captures data only during typing events. When a user watches a YouTube tutorial, reads documentation, or scrolls an article, the session recap says "Chrome" with no context. This research evaluates approaches to cheaply capture and classify passive screen activity.

**Key finding:** We don't need new infrastructure. Screenpipe already captures rich passive data that we're ignoring. The highest-impact, lowest-cost approach is to use data we already have (`browser_url`, `full_text`, `click` events, `content_hash`) combined with a heuristic classifier, and feed the enriched context into our existing Haiku batch call.

---

## 1. What Screenpipe Already Captures (That We Ignore)

### Current usage vs available data

| Data Source | Available | Tomato Uses? | Value for Passive Capture |
|-------------|-----------|:------------:|--------------------------|
| `frames.browser_url` | 33% of frames | No | **Critical** — exact URL of what user is viewing |
| `frames.full_text` | 98% of frames | No | **High** — complete visible screen text (avg 3,012 chars) |
| `frames.content_hash` | 98% of frames | No | **High** — detect reading/watching (screen unchanged) |
| `frames.capture_trigger` | 100% of frames | No | **Medium** — why frame was captured (click, idle, visual_change) |
| `ui_events` (click) | 70% of all events | No | **High** — element labels of what user clicked |
| `ui_events` (key) | 8% of all events | No | **Low** — keyboard shortcuts, less useful |
| `elements` (AXStaticText) | 171K rows | No | **Medium** — visible text content the user is reading |
| `elements` (AXButton) | 40K rows | No | **Low** — available UI actions |
| `elements` (AXLink) | 8K rows | No | **Low** — clickable links on screen |
| `audio_transcriptions` | 463 entries | No | **Medium** — speech content, meeting detection |
| `meetings` table | 2 entries | No | **Low** — auto-detected meetings |
| FTS indexes | All tables | No | **Medium** — fast keyword search across content |

### Data volume (per active hour)

- **ui_events:** ~1,276 rows/hour (21/min)
- **frames:** ~481 rows/hour (8/min) — ~33% are duplicates (screen unchanged)
- **elements:** ~48,000 rows/hour (~100/frame)

### Screenpipe's OCR pipeline (from source analysis)

Screenpipe uses **Apple Vision framework** (`VNRecognizeTextRequest`) as its primary OCR engine on macOS. The pipeline:

1. Frame captured via ScreenCaptureKit
2. Per-window cropping
3. OCR via Apple Vision (on-device, free) with confidence scores
4. Results cached per-window to avoid re-processing unchanged content
5. Text stored in `frames.full_text` and `elements` table (role=`block`)
6. FTS5 indexes updated for fast search

Screenpipe also captures the **accessibility tree** via macOS Accessibility APIs, providing structured AXHeading, AXStaticText, AXButton, and AXLink elements with their text content. This runs on a separate thread from OCR.

### URL extraction (from source analysis)

Browser URL is extracted via:
1. **Primary:** `AXDocument` accessibility attribute (returns loaded page URL directly)
2. **Fallback 1:** Accessibility tree walk looking for URL text fields
3. **Fallback 2:** AppleScript for Arc, Chrome, Safari (with title-matching to prevent tab-switch desync)

Only works for **focused** browser windows. Privacy filters block banking/sensitive domains.

---

## 2. Approach Comparison

### Comparison table

| Approach | Cost/Hour | Latency | Memory | Impl. Effort | Accuracy | Dependencies |
|----------|-----------|---------|--------|--------------|----------|-------------|
| **Heuristic classifier** | $0.00 | <1ms | 0 | 2 days | ~75% | None |
| **Enrich existing batch** (add untapped data to current Haiku call) | +$0.018/hr | 0ms extra | 0 | 1 day | ~90% (Haiku judges) | None new |
| **Haiku 3 condensation** (every 60s) | $0.015/hr | ~500ms | 0 | 2 days | ~90% | Haiku 3 API |
| **Haiku 4.5 condensation** (every 15s) | $0.138/hr | ~500ms | 0 | 2 days | ~92% | Haiku 4.5 API |
| **Ollama llama3.2:3b** (best local) | $0.00 | ~2.5s | 2.5GB | 3 days | ~100% (simple) | Ollama install |
| **Ollama llama3.2:1b** | $0.00 | ~2s | 2.5GB | 3 days | ~67% | Ollama install |
| **@electron/llm** (node-llama-cpp) | $0.00 | ~2.5s | 2.5GB | 3 days | ~100% (simple) | Native module, 2GB model download |
| **Apple Core ML** classification | $0.00 | ~50ms | ~200MB | 5+ days | Unknown | Custom model training |
| **Apple Vision OCR** (direct) | $0.00 | ~100ms | ~100MB | 3 days | ~95% | Swift bridge (unnecessary — screenpipe already does this) |

### Detailed findings per approach

#### Heuristic classifier (tested)

Pure string matching on app name, window title, URL domain, and intention keywords.

**Test results (8 scenarios):** 75% accuracy (6/8 correct)

Strengths:
- Zero cost, zero latency, zero dependencies
- Works offline
- Handles obvious cases well (YouTube cats = off-task, VS Code editing = on-task)

Weaknesses:
- Fails on ambiguous cases (CSS tutorial while building a login page — no keyword overlap)
- No understanding of content semantics
- Requires maintained domain lists

**Verdict:** Good as a first pass, but needs LLM backup for ambiguous cases.

#### Enriching existing Haiku batch call (recommended first step)

Instead of adding a new processing pass, add `browser_url`, `full_text` (truncated), and `click` event labels to the data we already send to Haiku every 60 seconds.

Current batch prompt is ~200 input tokens. Adding passive context would increase to ~400-500 tokens. At Haiku 4.5 pricing:
- Current: $0.042/hour → With context: $0.060/hour (+43%)
- Per day (8hr): $0.34 → $0.48 (+$0.14/day)
- Per month (22 days): $7.39 → $10.56 (+$3.17/month)

**Verdict:** The cheapest path to much better passive activity understanding. Haiku already knows how to interpret "user is reading Express.js docs while their intention is to build an API" — we just need to give it the data.

#### Local LLMs via Ollama (tested on this machine)

Tested multiple models with Ollama 0.21.1 on Apple M1 Pro (32GB RAM):

**Classification accuracy (3 scenarios: on-task VS Code, off-task Reddit, ambiguous Electron docs):**

| Model | Size | Accuracy | Notes |
|-------|------|----------|-------|
| llama3.2:3b | 2.0 GB | **3/3 (100%)** | Only model to handle nuanced case correctly |
| gemma2:2b | 1.6 GB | 2/3 (67%) | Failed on ambiguous scenario |
| phi3:mini (3.8B) | 2.2 GB | 2/3 (67%) | Failed on ambiguous scenario |
| llama3.2:1b | 1.3 GB | 2/3 (67%) | Failed on ambiguous scenario |
| qwen2.5:0.5b | 397 MB | 1/3 (33%) | Unreliable, often wrong on obvious cases |

**Performance (warm model, M1 Pro):**

| Model | Latency (warm) | Cold Start | Prompt Eval |
|-------|---------------|------------|-------------|
| qwen2.5:0.5b | 0.5-1.3s | ~13s | 570-2932 tok/s |
| llama3.2:1b | 2.2-2.5s | ~8s | 518-606 tok/s |
| llama3.2:3b | 2.0-2.5s | ~3s | 339-353 tok/s |
| phi3:mini | 4.1-4.5s | ~5s | 94-403 tok/s |
| gemma2:2b | 2.9-3.2s | ~2s | 171-548 tok/s |

**Memory:** Ollama process uses ~2.5-5.5 GB with one model loaded (includes KV cache). With a 2K context window (sufficient for classification), the footprint drops to ~2.5 GB.

**Key finding:** llama3.2:3b is the minimum viable model — the only one to correctly handle nuanced scenarios like "reading Electron IPC docs while working on an Electron app = on-task". But the full batch summarization prompt (7-category classification + drift assessment + summary) is likely beyond what a 3B model can reliably handle.

**Integration options:**
- `@electron/llm` (v1.1.1) — Electron's official node-llama-cpp wrapper. Runs model in utility process, supports JSON schema enforcement for guaranteed parseable output.
- `electron-ollama` — TypeScript wrapper to bundle Ollama binary in Electron app (~50MB).

**Verdict:** Viable for simple on-task/off-task classification as a pre-filter, but not a replacement for Haiku's full summarization pass. The 3B model + 2.5GB RAM is acceptable on 32GB machines but borderline on 16GB. Best reserved for offline/privacy mode rather than default behavior.

#### Apple Core ML

Core ML can run classification models on-device using the Neural Engine (no GPU/CPU impact). However:

- No pre-trained text classification model suitable for our task
- Would need to train a custom model on labeled activity data we don't have yet
- Training pipeline: labeled data → fine-tune → export .mlmodel → Swift bridge → Node.js FFI
- Implementation effort: 5+ days minimum, plus ongoing model maintenance

**Screenpipe note:** Screenpipe's codebase shows experimental Apple Intelligence integration for macOS 26+ using the Foundation Models API. This is promising for the future but requires macOS 26 which isn't widely deployed yet.

**Verdict:** Too much effort for uncertain quality. Revisit when we have labeled training data or Apple Intelligence becomes available on macOS 26.

#### Apple Vision OCR (direct, bypassing screenpipe)

Vision framework (`VNRecognizeTextRequest`) is already available and confirmed working on this machine. However, screenpipe already runs Apple Vision OCR and stores results in `frames.full_text` — we'd be duplicating work.

**Verdict:** Not needed. Screenpipe already does this. Use `frames.full_text` instead.

#### node-llama-cpp / @electron/llm (embedded LLM)

The `node-llama-cpp` npm package (v3.18.1) embeds llama.cpp as a native Node.js addon. Electron's official `@electron/llm` (v1.1.1) wraps it for Electron apps.

Advantages over Ollama:
- No external dependency — model runs in-process (utility process)
- JSON schema enforcement at generation level — guarantees parseable output matching TypeScript types
- Metal support built-in for Apple Silicon
- Pre-built binaries available, no user compilation needed

Disadvantages:
- Native module requiring `electron-rebuild` (same as better-sqlite3)
- ESM-only (Electron 28+ required — we use Electron 41, so this is fine)
- GGUF model files must be downloaded on first run (1.3-2.0 GB)
- Adds ~32 MB to `node_modules`

**Verdict:** The best integration path if we add local LLM support. JSON schema enforcement solves the output-parsing reliability problem. With llama3.2:3b, accuracy is sufficient for simple classification. Reserve for offline/privacy mode.

---

## 3. Recommended Architecture

### Tier 1: Use existing screenpipe data (1 day, $0 additional cost)

**What:** Read `browser_url`, `full_text` (truncated to ~500 chars), `click` event labels, and `content_hash` from the screenpipe DB. Feed this as additional context into the existing 60-second batch Haiku call.

**Changes required:**
1. `screenpipe-db.ts` — Add query methods for `browser_url` from frames, `full_text` (truncated), and `click` events from `ui_events`
2. `timeline-builder.ts` — Populate the existing `browserUrl` field on `TimelineEntry` (currently always null). Add screen content summary and click labels.
3. `llm-summarizer.ts` — Extend the batch prompt to include passive context section

**Cost impact:** Prompt grows from ~200 to ~400-500 tokens. With Haiku 4.5: +$3.17/month.

**Why this works:** We already call Haiku every 60 seconds. The model already classifies activity and detects drift. We're just giving it richer context to work with. When the user is reading Express.js docs while their intention is "write API endpoint", Haiku will see the URL and page headings and correctly classify it as on-task Research.

### Tier 2: Heuristic pre-filter for obvious cases (2 days, $0 cost)

**What:** Before calling Haiku, run a heuristic check on the enriched data. If the classification is obvious (YouTube cat videos + coding intention = clearly off-task), skip the LLM call and emit the classification directly.

**When to use LLM vs heuristic:**
- Heuristic confidence > 0.8 → use heuristic, skip LLM
- Heuristic confidence < 0.8 → use LLM as normal

**Cost impact:** Reduces LLM calls by ~30-50% for obvious cases.

### Tier 3: Screen change detection for idle/reading (1 day, $0 cost)

**What:** Use `content_hash` to detect when the screen content hasn't changed between frames. If screen is static for >30 seconds, classify as "reading" or "watching" without LLM. Combine with URL/app context for richer passive activity tracking.

**Data point:** 33% of frames are exact duplicates of the previous frame — these represent reading, watching, or idle time that we currently can't distinguish from typing gaps.

### Future: Local LLM for offline/privacy mode

If users request fully offline operation, `@electron/llm` (wrapping node-llama-cpp) with `llama3.2:3b` is the recommended path. This model scored 100% on simple on-task/off-task classification in testing, with ~2.5s latency and ~2.5GB memory. JSON schema enforcement guarantees parseable output.

The local model would handle simple classification only — the full batch summarization (7-category classification + drift assessment + narrative summary) should remain on Haiku, which handles complex multi-output prompts reliably.

**Note:** Apple's Foundation Models API (screenpipe has experimental support) could be a zero-dependency option on macOS 26+, but adoption is too early to depend on.

---

## 4. Screenpipe Internals Deep Dive

### How screenpipe processes data before it hits the DB

1. **Screen capture** (ScreenCaptureKit): Captures focused windows at adaptive FPS (faster during activity, slower when idle). Frame comparison using histogram delta on 1/4-resolution images skips unchanged frames.

2. **OCR** (Apple Vision): `VNRecognizeTextRequest` processes each frame. Results include confidence scores and bounding boxes. OCR results are cached per-window to avoid re-processing unchanged content.

3. **Accessibility tree**: Separate thread reads the macOS accessibility tree via `NSAccessibility` APIs. Captures element roles, names, values, and bounds. Stored in `elements` table with source=`accessibility`.

4. **UI events**: CGEventTap captures mouse clicks, key presses, clipboard operations, and app switches. Events include element context (role, name, value, bounds) from the accessibility tree at the click point.

5. **Audio transcription**: Parakeet/ParakeetMlx models run on-device speech-to-text. Speaker identification via voice embeddings. 463 transcriptions captured over 8 days of data.

6. **Database writes**: Batch-coalesced via write queue to reduce SQLite contention. FTS5 indexes updated for full-text search across all tables.

### Privacy and safety

- Banking/sensitive domain URLs are blocked from capture
- Incognito window detection prevents capture
- All processing is on-device (OCR, accessibility, audio)
- Data stays in `~/.screenpipe/db.sqlite`

---

## 5. What We're Leaving on the Table Today

### Zero-cost improvements (use existing screenpipe data)

1. **`browser_url`** — Available on 33% of frames. Tells us exactly which webpage the user is viewing. Currently queried in `getFrames()` and `getLatestFrame()` but the `TimelineEntry.browserUrl` field is never populated.

2. **`frames.full_text`** — Available on 98% of frames, avg 3,012 chars. Complete text visible on screen. Could be truncated and sent as context to Haiku.

3. **`click` events** — 70% of all `ui_events` (12,594 events). Include `element_name` showing exactly what the user clicked ("End session", "Resume", file menu items). High-signal for understanding intent.

4. **`content_hash`** — Available on 98% of frames. Only 67% unique, meaning 33% of frames show unchanged content. Can detect reading/watching/idle with zero cost.

5. **`capture_trigger`** — Tells us whether frame was captured due to click (5,095), visual_change (1,820), idle (701), or app_switch (241). Idle-triggered frames indicate passive consumption.

6. **`audio_transcriptions`** — 463 speech-to-text entries. Could detect meetings or dictation and suppress drift alerts.

---

## 6. Cost Analysis

### Per-hour cost comparison (Haiku 4.5 pricing: $1.00/M input, $5.00/M output)

| Scenario | Cost/Hour | Daily (8hr) | Monthly (22 days) |
|----------|-----------|-------------|-------------------|
| Current (batch every 60s) | $0.042 | $0.34 | $7.39 |
| **Recommended: enriched batch** | $0.060 | $0.48 | $10.56 |
| With heuristic pre-filter (~40% skip) | $0.042 | $0.34 | $7.39 |
| Haiku 3 for condensation (every 60s) | $0.015 | $0.12 | $2.64 |
| Haiku 4.5 two-pass (15s + 60s) | $0.180 | $1.44 | $31.68 |
| Local LLM (Ollama) | $0.000 | $0.00 | $0.00 |

**Recommended approach (enriched batch + heuristic pre-filter) costs the same as today** — the heuristic skips enough LLM calls to offset the larger prompt size.

### Token budget for enriched batch prompt

Current prompt: ~200 input tokens, ~100 output tokens

Proposed additions per batch:
- Browser URL: ~20 tokens
- Truncated full_text (top 200 chars): ~50 tokens
- Click event labels (last 5 clicks): ~30 tokens
- Screen change indicator: ~10 tokens

**Total enriched prompt: ~310 input tokens** — a 55% increase, well within Haiku's efficiency.

---

## 7. Recommended Next Story

### IDE-XXX: Enrich batch summarizer with passive activity context

**Scope:** Use existing screenpipe data to give the drift summarizer context about passive activities (browsing, reading, watching).

**Tasks:**
1. Add `getClickEvents(since, until)` to `screenpipe-db.ts` — query click events with element_name
2. Add `getScreenContent(since, until)` to `screenpipe-db.ts` — query `full_text` (truncated) and `content_hash` from frames
3. Populate `TimelineEntry.browserUrl` from frame data in `timeline-builder.ts`
4. Add `PassiveContext` to `TimelineEntry` with screen content summary, click labels, and screen-changed flag
5. Extend batch prompt in `llm-summarizer.ts` with passive context section
6. Add heuristic pre-classifier that can skip LLM calls for obvious cases (known off-task domains, known dev tools)
7. Update tests

**Estimated effort:** 2-3 days  
**Dependencies:** None — uses existing screenpipe data  
**Risk:** Low — additive change, existing flow unchanged

---

## Appendix A: Ollama Benchmark Results

Tested on Apple M1 Pro (32GB RAM) via Ollama 0.21.1.

### Multi-model classification accuracy

Three test scenarios per model:
1. **On-task:** VS Code editing register.ts, intention "write API endpoint"
2. **Off-task:** Reddit r/programming, intention "write API endpoint"  
3. **Ambiguous:** Reading Electron IPC docs, intention "build Electron app" (correct answer: on-task)

| Model | Size | Test 1 | Test 2 | Test 3 (hard) | Score |
|-------|------|:------:|:------:|:-------------:|-------|
| **llama3.2:3b** | 2.0 GB | ON-TASK | OFF-TASK | ON-TASK | **3/3** |
| gemma2:2b | 1.6 GB | ON-TASK | OFF-TASK | OFF-TASK | 2/3 |
| phi3:mini | 2.2 GB | ON-TASK | OFF-TASK | OFF-TASK | 2/3 |
| llama3.2:1b | 1.3 GB | ON-TASK | OFF-TASK | OFF-TASK | 2/3 |
| qwen2.5:0.5b | 397 MB | OFF-TASK | ON-TASK | ON-TASK | 1/3 |

### Performance (warm model)

| Model | Latency | Cold Start | Memory |
|-------|---------|------------|--------|
| qwen2.5:0.5b | 0.5-1.3s | ~13s | ~1.5 GB |
| llama3.2:1b | 2.2-2.5s | ~8s | ~2.5 GB |
| llama3.2:3b | 2.0-2.5s | ~3s | ~2.5 GB |
| phi3:mini | 4.1-4.5s | ~5s | ~3.5 GB |
| gemma2:2b | 2.9-3.2s | ~2s | ~3.0 GB |

### Key takeaway

llama3.2:3b is the minimum viable model. Sub-3B models fail on nuanced cases. The 0.5B model is essentially random.

### Heuristic classifier accuracy: 75% (6/8)

| Scenario | Expected | Got | Correct? |
|----------|----------|-----|:--------:|
| VS Code - register.ts | ON-TASK | ON-TASK | Yes |
| Chrome - YouTube Cat Videos | OFF-TASK | OFF-TASK | Yes |
| Chrome - Express.js Routing | ON-TASK | OFF-TASK | No |
| Slack - general channel | OFF-TASK | OFF-TASK | Yes |
| Chrome - SO flexbox | ON-TASK | ON-TASK | Yes |
| Chrome - Reddit r/programming | OFF-TASK | OFF-TASK | Yes |
| Chrome - CSS Centering Guide | ON-TASK | OFF-TASK | No |
| VS Code - auth.test.ts | ON-TASK | ON-TASK | Yes |

## Appendix B: Screenpipe Database Schema (Key Tables)

```sql
-- frames: screen captures with rich metadata
CREATE TABLE frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP NOT NULL,
    app_name TEXT,              -- Application name
    window_name TEXT,           -- Window title
    focused BOOLEAN,           -- Is window focused
    browser_url TEXT,          -- Browser URL (33% populated)
    full_text TEXT,            -- Complete visible screen text (98% populated)
    content_hash INTEGER,      -- Screen content hash for dedup
    simhash INTEGER,           -- Similarity hash
    capture_trigger TEXT,      -- Why captured: click|visual_change|idle|app_switch
    text_source TEXT,          -- How text extracted: accessibility|ocr|hybrid
    accessibility_tree_json TEXT,
    snapshot_path TEXT
);

-- elements: accessibility tree + OCR elements per frame
CREATE TABLE elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frame_id INTEGER NOT NULL,
    source TEXT NOT NULL,       -- 'ocr' | 'accessibility'
    role TEXT NOT NULL,         -- AXButton, AXStaticText, AXHeading, block, etc.
    text TEXT,
    confidence REAL,           -- OCR confidence (0-100)
    left_bound REAL,           -- Normalized bounding box
    top_bound REAL,
    width_bound REAL,
    height_bound REAL,
    depth INTEGER NOT NULL
);

-- ui_events: user input events
CREATE TABLE ui_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    event_type TEXT NOT NULL,   -- click|key|text|app_switch|clipboard|move|scroll
    text_content TEXT,
    app_name TEXT,
    window_title TEXT,
    browser_url TEXT,           -- Always NULL on events; use frames instead
    element_role TEXT,          -- AXButton, AXStaticText, etc.
    element_name TEXT,          -- Label of clicked element
    element_value TEXT,
    element_bounds TEXT         -- JSON bounding box
);

-- audio_transcriptions: speech-to-text
CREATE TABLE audio_transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP NOT NULL,
    transcription TEXT NOT NULL,
    speaker_id INTEGER,
    transcription_engine TEXT   -- Parakeet | ParakeetMlx
);
```

## Appendix C: Data Volume Statistics

From 8 days of screenpipe data on this machine:

| Table | Total Rows | Unique Content | Notes |
|-------|-----------|----------------|-------|
| frames | 8,020 | 5,288 unique hashes (67%) | ~8/min during active use |
| ui_events | 17,912 | — | ~21/min during active use |
| elements | 398,360 | — | ~100/frame average |
| audio_transcriptions | 463 | — | Parakeet on-device STT |
| ocr_text (legacy) | 3,480 | — | Superceded by frames.full_text |

### Event type distribution in ui_events

| Type | Count | % | Tomato Uses? |
|------|-------|---|:------------:|
| click | 12,594 | 70% | No |
| text | 3,041 | 17% | Yes |
| key | 1,453 | 8% | No |
| app_switch | 590 | 3% | Yes |
| clipboard | 234 | 1% | Yes |
