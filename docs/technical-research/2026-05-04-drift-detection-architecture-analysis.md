# Drift Detection Architecture Analysis

**Date:** 2026-05-04
**Context:** Investigating why drift detection feels delayed or sometimes doesn't fire at all.

## Current Architecture

### Data Pipeline

```mermaid
sequenceDiagram
    participant SP as Screenpipe Binary
    participant DB as ~/.screenpipe/db.sqlite
    participant Tick as Tick Timer (15s)
    participant TB as TimelineBuilder
    participant Batch as Batch Timer (60s)
    participant Prompt as Prompt Builder
    participant LLM as Claude Haiku
    participant Mem as activities[] (in-memory)
    participant HUD as HudPage (renderer)

    Note over SP,DB: Screen Capture Layer (continuous)
    loop Every ~1s
        SP->>DB: Write frames, text events,<br/>app switches, clipboard, a11y
    end

    Note over Tick,HUD: Tick Flow (display only, no classification)
    loop Every 15s
        Tick->>TB: Query last 15s
        TB->>DB: Read events
        DB-->>TB: Raw events
        TB-->>Tick: Timeline entries
        Tick->>HUD: IPC: timeline-update
    end

    Note over Batch,HUD: Batch Flow (LLM classification)
    loop Every 60s
        Batch->>TB: Query last 60s
        TB->>DB: Read events
        DB-->>TB: Raw events
        TB-->>Prompt: ActivityTimeline
        Mem-->>Prompt: Last 10 summaries (rolling context)
        Prompt->>LLM: Full prompt (intention + timeline + context)
        LLM-->>Batch: {summary, classification, isDrifting, confidence}
        Batch->>Mem: Store new activity
        Batch->>HUD: IPC: activity-update
        alt isDrifting AND confidence >= 0.6
            Batch->>HUD: IPC: drift-detected
        end
    end
```

### Key Timing Constants

| Stage | Interval | Source | Purpose |
|-------|----------|--------|---------|
| Screenpipe capture | ~1s | screenpipe binary | Records screen frames to SQLite |
| Tick | 15s (`DEFAULT_TICK_MS`) | focus-tracker.ts | Polls screenpipe DB, updates debug dashboard |
| Batch | 60s (`DEFAULT_BATCH_MS`) | focus-tracker.ts | Queries last 60s, calls LLM, classifies drift |
| LLM inference | ~1-3s | Anthropic API | Haiku response time |
| Drift threshold | confidence >= 0.6 | focus-tracker.ts:260 | Below this, drift is detected but NOT surfaced to user |

### Batch Window Behavior

The batch timer runs every 60 seconds. Each batch queries `now - 60s` to `now`. The windows are **disjoint and non-overlapping** — there's no continuity between batches except the rolling context (last 10 summaries fed into the prompt via IDE-140).

## Why Drift Detection Feels Delayed or Absent

### The Delay Timeline

```mermaid
sequenceDiagram
    participant User
    participant Screenpipe as Screenpipe DB
    participant Tick as Tick (15s)
    participant Batch as Batch (60s)
    participant LLM as Claude Haiku
    participant HUD

    Note over User: Working in VS Code (on-track)

    rect rgb(220, 252, 231)
        Note over Batch: Batch fires at :00
        Batch->>Screenpipe: Query last 60s
        Screenpipe-->>Batch: Timeline (coding activity)
        Batch->>LLM: Classify
        LLM-->>Batch: on-track, 92%
        Batch->>HUD: activity-update
    end

    Note over User: Opens YouTube at :05

    rect rgb(254, 243, 199)
        Note over Tick: Ticks at :15, :30, :45
        Note over Tick: Tick sees YouTube but<br/>does NOT classify drift.<br/>Tick is display-only.
        Note over User: 55 seconds of distraction<br/>with no evaluation
    end

    rect rgb(254, 226, 226)
        Note over Batch: Batch fires at :60
        Batch->>Screenpipe: Query last 60s (:00 to :60)
        Note over Batch: Window shows ~55s YouTube<br/>but rolling context says<br/>"on-track for 10 min"
        Screenpipe-->>Batch: Timeline (YouTube)
        Batch->>LLM: Classify with rolling context
        LLM-->>Batch: drifting, confidence=0.55
        Note over Batch: 0.55 < 0.60 threshold<br/>NOT surfaced to user
    end

    rect rgb(254, 202, 202)
        Note over Batch: Batch fires at :120
        Batch->>Screenpipe: Query last 60s (:60 to :120)
        Screenpipe-->>Batch: Timeline (still YouTube)
        Batch->>LLM: Classify (rolling context now has one "drifting" entry)
        LLM-->>Batch: off-track, 89%
        Batch->>HUD: drift-detected
        Note over User: FINALLY sees alert<br/>~115 seconds after distraction started
    end
```

### Root Causes (ranked by impact)

```mermaid
pie title "Where drift detection delay comes from"
    "Batch alignment (0-60s wait)" : 45
    "Rolling context benefit-of-doubt" : 25
    "Confidence threshold filtering" : 20
    "LLM inference time" : 5
    "Screenpipe write latency" : 5
```

#### 1. Batch Alignment (0-60s delay)

The batch fires on a fixed interval. If you open YouTube at second :05 of a batch window, the distraction won't be evaluated until second :60. **Average expected delay: ~32 seconds** (half the batch interval + inference time). Worst case: 60 seconds.

#### 2. The 60s Window Dilutes Short Distractions

If you open Twitter for 15 seconds within a 60-second window where you were coding for 45 seconds, the timeline shows 75% on-task activity. The prompt says "be proportionate" and "false positives are worse than false negatives." The LLM correctly sees a mostly-focused window and classifies it as on-track.

**Brief distractions under ~20s are almost guaranteed to be missed** within a 60s window.

#### 3. Rolling Context Delays First Detection

IDE-140's rolling context feeds the last 10 summaries into the prompt with a note: "A user who has been on-track and briefly switches apps may be pivoting tactically, not drifting." If you've been on-track for 10 minutes, the LLM gives benefit of the doubt on the **first batch** of a genuine distraction. Real drift often isn't flagged until the **second batch** (~2 minutes into the distraction).

#### 4. Confidence Threshold Gates the Alert

Even when the LLM classifies `isDrifting: true`, the alert only surfaces if `confidence >= 0.6` (focus-tracker.ts:260). A borderline distraction might get `isDrifting: true, confidence: 0.45` — detected internally but never shown to the user.

#### 5. Screenpipe Data is Sparse for Passive Consumption

The most common distraction pattern — **passive consumption** (watching videos, scrolling feeds) — generates the weakest signal:

- **Text events** only fire when typing. Watching YouTube = zero text events.
- **App switches** only fire on focus changes. Staying in one tab = one event.
- **Passive frames** (screen OCR) are noisy and may not capture video content reliably.

The LLM might see just: `[Chrome — YouTube] (passive consumption — no typing detected)` — a thin signal to classify.

#### 6. Empty Batches Are Skipped Entirely

If `timeline.entries.length === 0` (no screenpipe data in the window), the batch is skipped without calling the LLM (focus-tracker.ts:176-179). Those 60 seconds are unmonitored.

## The Core Tension

Short intervals (15-30s) catch distractions faster but produce more false positives and give the LLM less context to distinguish drift from tactical pivots.

Long intervals (60s+) reduce false positives and give better context, but distractions go unnoticed for up to a minute, and brief distractions are diluted.

The prompt is tuned heavily toward **false-positive avoidance** (rule 4: "when uncertain, classify as NOT drifting"). This preserves user trust but means the system errs on the side of silence.

## Feasibility: Event-Driven Detection

### Research findings

**Can we hook into real-time app focus events instead of polling?**

Yes. There are two viable approaches on macOS:

**1. `systemPreferences.subscribeWorkspaceNotification` (Electron native)**

Electron exposes macOS `NSWorkspace` notifications. We can subscribe to `NSWorkspaceDidActivateApplicationNotification` to get **instant** callbacks when any app gains focus — no polling needed. This fires on every Cmd+Tab, Dock click, or app launch.

```ts
// Fires instantly on every app focus change — no delay
systemPreferences.subscribeWorkspaceNotification(
  'NSWorkspaceDidActivateApplicationNotification',
  (event, userInfo) => {
    const appName = userInfo['NSWorkspaceApplicationKey']?.localizedName;
    // appName is now the newly-focused app
  }
);
```

**2. Screenpipe `ui_events` table with high-frequency poll**

The screenpipe DB records `app_switch` events in `ui_events`. We could poll just this one lightweight query every 2-3 seconds instead of the full timeline query every 15s. The query is tiny — single indexed column filter.

**Option 1 is clearly better** — zero latency, native OS event, no polling at all. The screenpipe DB polling remains useful for the deep tier (typed text, URLs, passive frames) but app focus changes should come from the OS directly.

**What about passive consumption (YouTube watching)?**

This is the key challenge. An event-driven system reacts to **user actions** — but watching a YouTube video is the *absence* of action. The user switches to Chrome/YouTube once, then does nothing for 20 minutes. There's only one event (the app switch), then silence.

This means: **event-driven detection catches the *start* of a distraction instantly, but cannot distinguish "still watching YouTube" from "walked away from the computer" without a background timer.**

The solution is a hybrid: events detect transitions, a background timer detects persistence.

### Handling false positives from rapid switching

The concern about Cmd+Tab flickering and dev workflows (terminal ↔ editor) is real. The fix is a **dwell time filter**: don't react to an app switch until the user has *stayed* in the new app for a minimum duration.

- **< 3 seconds**: Ignore entirely. This is Cmd+Tab overshoot, accidental switches, quick glances.
- **3-15 seconds**: Note it but don't classify. Could be a quick reference check.
- **> 15 seconds**: The user has settled into this app. Now evaluate.

Every dwell timer is cancelled if the user switches away before it fires. No user configuration needed.

## Proposed Architecture: Event-Driven + Passive Timer Hybrid

```mermaid
sequenceDiagram
    participant User
    participant OS as macOS<br/>NSWorkspace
    participant FT as FocusTracker<br/>(event handler)
    participant Dwell as Dwell Timer<br/>(per app switch)
    participant Passive as Passive Timer<br/>(recurring, every 90s)
    participant SP as Screenpipe DB
    participant LLM as LLM<br/>(Haiku / Local 3B)
    participant HUD as HudPage

    Note over User: Working in VS Code

    User->>OS: Cmd+Tab to Terminal
    OS->>FT: App activated: Terminal
    FT->>Dwell: Start 15s dwell timer
    User->>OS: Cmd+Tab back to VS Code (2s later)
    OS->>FT: App activated: VS Code
    FT->>Dwell: Cancel Terminal timer
    Note over FT: Brief switch, ignored

    User->>OS: Clicks YouTube in Chrome
    OS->>FT: App activated: Chrome
    FT->>Dwell: Start 15s dwell timer

    User->>OS: Cmd+Tab back to VS Code (3s later)
    OS->>FT: App activated: VS Code
    FT->>Dwell: Cancel Chrome timer
    Note over FT: Brief glance, ignored

    User->>OS: Clicks YouTube in Chrome again
    OS->>FT: App activated: Chrome
    FT->>Dwell: Start 15s dwell timer

    Note over User: Stays on YouTube...

    Dwell->>FT: 15s elapsed, user still in Chrome
    FT->>SP: Query last 20s of screenpipe data
    SP-->>FT: Chrome → YouTube URL,<br/>no typing, passive consumption
    FT->>LLM: Targeted eval: intention + app + URL
    LLM-->>FT: Off-task, 87% confidence
    FT->>HUD: drift-detected
    Note over HUD: Alert ~18s after<br/>YouTube opened

    Note over User: Stays on YouTube for minutes...

    Note over Passive: Recurring timer (fires every 90s for entire session)
    loop Every 90s while session is active
        Passive->>SP: Query last 90s
        SP-->>Passive: Full timeline + passive frames
        Passive->>LLM: Deep eval with rolling context
        LLM-->>Passive: Still off-task, 94% confidence
        Passive->>HUD: Update drift card with richer summary
    end
```

### Scenario pressure tests

```mermaid
sequenceDiagram
    participant User
    participant FT as FocusTracker
    participant LLM
    participant HUD

    Note over User,HUD: Scenario 1: Cmd+Tab overshoot
    User->>FT: VS Code → Slack (accidental)
    Note over FT: Start 15s dwell timer
    User->>FT: Slack → VS Code (1s later)
    Note over FT: Cancel timer
    Note over HUD: Nothing happens ✅

    Note over User,HUD: Scenario 2: Dev toggling terminal ↔ editor (20x)
    User->>FT: VS Code → Terminal
    Note over FT: Start 15s dwell timer
    User->>FT: Terminal → VS Code (4s later)
    Note over FT: Cancel timer
    User->>FT: VS Code → Terminal
    Note over FT: Start 15s dwell timer
    User->>FT: Terminal → VS Code (6s later)
    Note over FT: Cancel timer
    Note over FT: This repeats — every switch<br/>starts a timer, every switch-back<br/>cancels it. No timer ever fires<br/>because the user never stays 15s.
    Note over HUD: Nothing happens ✅

    Note over User,HUD: Scenario 3: Quick Slack check (12s)
    User->>FT: VS Code → Slack
    Note over FT: Start 15s dwell timer
    Note over User: Reads one message, replies (12s)
    User->>FT: Slack → VS Code
    Note over FT: Cancel timer (12s < 15s)
    Note over HUD: Nothing happens ✅

    Note over User,HUD: Scenario 4: YouTube rabbit hole
    User->>FT: VS Code → Chrome (YouTube)
    Note over FT: Start 15s dwell timer
    Note over User: Keeps watching...
    Note over FT: Timer fires at 15s
    FT->>LLM: Targeted eval (intention + YouTube URL)
    LLM-->>FT: Off-task, 87%
    FT->>HUD: drift-detected (~18s total)
    Note over HUD: Alert shows ✅

    Note over User,HUD: Scenario 5: Still on YouTube at minute 5
    Note over FT: Passive 90s timer fires
    FT->>LLM: Deep eval with full context
    LLM-->>FT: Still off-task, 94%
    FT->>HUD: Updated drift summary
    Note over FT: Fires again at 3:00, 4:30, 6:00...
    Note over HUD: Drift card stays, refreshes ✅
```

### Harder scenarios — where does this break?

```mermaid
sequenceDiagram
    participant User
    participant FT as FocusTracker
    participant LLM
    participant HUD

    Note over User,HUD: Scenario 6: Slack rabbit hole (gradual drift)
    Note over User: Intention: "Write API docs"
    User->>FT: VS Code → Slack
    Note over FT: Start 15s dwell timer
    Note over User: Answering a work question (on-task)
    Note over FT: Timer fires at 15s
    FT->>LLM: Slack + window title "team-engineering"
    LLM-->>FT: On-task, 75% (work-related channel)
    Note over HUD: No alert
    Note over User: But now scrolling #random for 10 min...
    Note over FT: No new app switch event!<br/>User is still in Slack the whole time.<br/>Only the 90s passive timer catches this.
    Note over FT: Passive timer fires at 90s
    FT->>LLM: Deep eval — 90s in Slack, no typing,<br/>passive consumption
    LLM-->>FT: Drifting, 72%
    FT->>HUD: drift-detected
    Note over HUD: Alert at ~90s ⚠️<br/>WEAKNESS: Same delay as<br/>current architecture for<br/>within-app drift

    Note over User,HUD: Scenario 7: Chrome tab switch (no app switch)
    Note over User: Intention: "Debug auth flow"
    Note over User: In Chrome reading Stack Overflow (on-task)
    Note over User: Clicks a link → Reddit thread
    Note over FT: NO event fired!<br/>NSWorkspace only fires on<br/>app-level focus changes,<br/>not tab/window changes<br/>within the same app.
    Note over User: Reading Reddit for 20 min...
    Note over FT: Passive timer fires at 90s
    FT->>LLM: Deep eval — Chrome, passive,<br/>URL might show reddit.com
    LLM-->>FT: Off-task, 82%
    FT->>HUD: drift-detected
    Note over HUD: Alert at ~90s ⚠️<br/>WEAKNESS: Tab switches within<br/>Chrome are invisible to<br/>event-driven layer

    Note over User,HUD: Scenario 8: Work on YouTube
    Note over User: Intention: "Learn React hooks"
    User->>FT: VS Code → Chrome (YouTube)
    Note over FT: Start 15s dwell timer
    Note over FT: Timer fires at 15s
    FT->>LLM: YouTube URL + intention "Learn React hooks"
    LLM-->>FT: On-task, 80% (tutorial matches intention)
    Note over HUD: No alert ✅

    Note over User,HUD: Scenario 9: Multiple monitors
    Note over User: VS Code on monitor 1,<br/>YouTube on monitor 2
    Note over User: Clicks YouTube window
    User->>FT: App activated: Chrome
    Note over FT: Start 15s dwell timer
    Note over User: Clicks VS Code window (5s later)
    User->>FT: App activated: VS Code
    Note over FT: Cancel timer
    Note over User: Eyes on YouTube,<br/>hands occasionally click VS Code<br/>to keep it "active"
    Note over FT: User gaming the system.<br/>Each click resets the dwell timer.
    Note over HUD: No alert ⚠️<br/>WEAKNESS: Multi-monitor<br/>gaming is undetectable<br/>via app focus alone

    Note over User,HUD: Scenario 10: Slow drift into social media
    Note over User: Intention: "Write blog post"
    Note over User: In Chrome, writing in Google Docs
    Note over User: Opens new tab → Twitter
    Note over FT: NO event — same app (Chrome)
    Note over User: Scrolls Twitter for 2 minutes
    Note over User: Opens another tab → Instagram
    Note over FT: Still no event — same app
    Note over User: 5 minutes of social media
    Note over FT: Passive timer at 90s
    FT->>LLM: Chrome, passive, URLs show<br/>twitter.com, instagram.com
    LLM-->>FT: Off-task, 91%
    FT->>HUD: drift-detected at ~90s
    Note over HUD: WEAKNESS: In-browser drift<br/>is only caught by passive timer
```

### Weakness summary

| Weakness | Description | Impact | Mitigation |
|----------|-------------|--------|------------|
| **Within-app drift** | User stays in Slack but shifts from work channel to #random. No app switch event fires. | High — very common pattern | Only the 90s passive timer catches this. Could shorten passive cadence to 45s when in comms apps. |
| **Browser tab switches** | User goes from Stack Overflow to Reddit within Chrome. NSWorkspace doesn't fire — it's the same app. | High — most distractions happen in the browser | Screenpipe passive frames capture URLs. The passive timer sees the URL change. Could add a fast URL-change detector polling screenpipe's frames table every 10-15s (tiny query). |
| **Multi-monitor gaming** | User keeps clicking the "right" app to reset dwell timers while watching something on another screen. | Low — requires deliberate effort to fool the system | Essentially unsolvable via app focus. Would need gaze tracking or screen content analysis. Not worth solving now. |
| **Gradual tab-hopping** | User drifts from work tab → tangentially related → clearly off-task over 5-10 minutes, all within Chrome. | Medium — common but slow | The 90s passive timer eventually catches it via URL analysis. The delay is inherent to within-app drift. |
| **15s dwell false negative** | User checks Twitter for 14 seconds — just under the threshold. Genuinely distracted but not flagged. | Low — 14s distractions are self-correcting | Could track cumulative time in flagged states: 5x 14-second Twitter checks = 70s total, trigger eval even though no single dwell exceeded 15s. |

### Key design decisions (revised)

**App switches come from macOS, not polling.** `systemPreferences.subscribeWorkspaceNotification('NSWorkspaceDidActivateApplicationNotification')` gives instant, zero-latency app focus events. No screenpipe polling needed for this signal.

**Dwell time filter (15s) prevents false positives.** Every app switch starts a timer. Every subsequent switch cancels the previous timer. Only when the user *stays* for 15s does evaluation trigger. This naturally handles Cmd+Tab overshoot, dev toggling, and quick reference checks — no app allowlists or session sets needed.

**Targeted LLM eval on dwell.** When the dwell timer fires, query only the last ~20s of screenpipe data for context (URL, window title, typed text). The prompt is short and focused: "User's intention is X. They've been in [app + URL] for 15 seconds. Is this on-task?" Faster and cheaper than the current full-window batch.

**Recurring passive timer (90s) handles everything the event layer can't.** Fires every 90s for the entire session. Catches: within-app drift (Slack #random), browser tab changes, sustained passive consumption, and gradual drift. Uses the full prompt with rolling context. This is essentially the current batch timer but at a longer cadence since fast detection is handled by events.

**No session app set.** Every app switch is treated equally — the dwell timer is the only filter. This is simpler, has no user configuration, and avoids the problem of a "safe" app auto-learning a distraction app.

### The honest assessment

This architecture dramatically improves detection for **app-level distractions** (YouTube, Twitter app, gaming) — from ~115s to ~18s. But it has the same ~90s delay as today for **within-app distractions** (browser tab changes, Slack channel drift). Those within-app cases are arguably the more common pattern for knowledge workers who live in the browser.

The browser tab problem is solvable by adding a lightweight URL-change poll (query screenpipe's `frames` table for `browser_url` every 10-15s — a tiny indexed query). But it adds back polling for one specific case. Worth doing, but it's a separate enhancement.

## Open Questions

- Does the 15-second dwell time feel right, or should it be shorter (10s) or longer (20s)?
- Can the local 3B model (IDE-146) handle the quick targeted eval fast enough? (~1-2s on a short prompt)
- Should the passive timer cadence adapt? (e.g., 90s when on-track, 45s when in a flagged app)
- Should we add a fast URL-change detector for browsers specifically? (Poll `frames.browser_url` every 10s)
- How do we handle the "work YouTube" case? (The LLM should handle this via intention matching, but we should test it)
- Should we track cumulative dwell in flagged states? (5x 14-second Twitter checks = 70s total)
- IDE-149 (batch interval experiment) data may inform the passive timer cadence
