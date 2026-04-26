# Proposed Behavior Pipeline

```mermaid
sequenceDiagram
    participant K as Keylistener
    participant B as TextBuffer
    participant P as PollTicker
    participant DB as Screenpipe DB
    participant Q as EventQueue
    participant L as Haiku (batch)

    rect rgb(245, 240, 232)
    Note right of P: POLL (every 15s, no LLM)
    P->>DB: SELECT app_name, window_name<br/>FROM frames ORDER BY id DESC
    DB-->>P: app, window title
    Note right of P: Also: SELECT role, text<br/>FROM elements (a11y tree)
    end

    K->>B: chunk("const x")
    K->>B: chunk(" = 42;")

    rect rgb(245, 240, 232)
    Note right of B: 2s typing pause
    B->>DB: SELECT app_name, window_name<br/>FROM frames WHERE timestamp BETWEEN ±5s
    DB-->>B: window titles around event
    B->>Q: BehaviorEvent (text_composed)
    end

    K->>B: chunk("// fix bug")
    K->>B: chunk(" in auth")

    rect rgb(245, 240, 232)
    Note right of P: Poll detects app switch
    P->>B: notifyAppSwitch()
    B->>DB: SELECT app_name, window_name<br/>FROM frames WHERE timestamp BETWEEN ±5s
    DB-->>B: window titles around event
    B->>Q: BehaviorEvent (app_switch)
    B->>Q: BehaviorEvent (text_composed)
    end

    K->>B: chunk("reviewed PR")

    rect rgb(245, 240, 232)
    Note right of B: Enter key
    B->>DB: query frames + elements
    DB-->>B: structured context
    B->>Q: BehaviorEvent (text_composed)
    end

    rect rgb(251, 229, 227)
    Note right of Q: BATCH SUMMARIZE (every 3 min)
    Note right of Q: One LLM call per interval
    Q->>L: BehaviorEvents as structured JSON
    Note right of L: Summarize what user accomplished
    Note right of L: Classify: coding / debugging / writing / ...
    L-->>Q: summary + classification
    end

    rect rgb(232, 245, 233)
    Note right of Q: DRIFT CHECK (after summary)
    Q->>L: intention + classification
    L-->>Q: on_track / drifted
    Note right of Q: If drifted → show nudge
    end
```

## Key differences from current implementation

1. **Direct DB queries instead of HTTP API** — Read `~/.screenpipe/db.sqlite` directly for `frames`, `ocr_text`, and `elements` (accessibility tree) tables. Faster, no auth issues, access to structured UI data the HTTP API doesn't expose.

2. **Accessibility tree for structured context** — The `elements` table has `role` and `text` for UI elements (buttons, text fields, headings). Window titles + element roles give us "user is in a text input in Slack" without parsing raw OCR.

3. **No LLM on individual events** — BehaviorEvents accumulate in a queue. Only the batch summarizer (every 3 min) calls the LLM, receiving all events from that window as structured JSON.

4. **Combined summarization + classification** — One Haiku call both summarizes and classifies the activity type, which then feeds directly into drift detection.
