# Behavior Pipeline

```mermaid
sequenceDiagram
    participant K as Keylistener
    participant B as TextBuffer
    participant P as PollTicker
    participant S as Screenpipe
    participant Q as EventQueue
    participant L as Haiku (batch)

    rect rgb(245, 240, 232)
    Note right of P: EVIDENCE COLLECTION (no LLM)
    P->>S: queryOcr() every 15s
    S-->>P: app, window, a11y data
    end

    K->>B: chunk("const x")
    K->>B: chunk(" = 42;")

    rect rgb(245, 240, 232)
    Note right of B: 2s typing pause
    B->>S: queryOcr(event ±5s)
    S-->>B: screen context
    B->>Q: BehaviorEvent (text_composed)
    end

    K->>B: chunk("// fix bug")
    K->>B: chunk(" in auth")

    rect rgb(245, 240, 232)
    Note right of P: Poll detects app switch
    P->>B: notifyAppSwitch()
    B->>S: queryOcr(event ±5s)
    S-->>B: screen context
    B->>Q: BehaviorEvent (app_switch)
    B->>Q: BehaviorEvent (text_composed)
    end

    K->>B: chunk("reviewed PR")

    rect rgb(245, 240, 232)
    Note right of B: Enter key
    B->>S: queryOcr(event ±5s)
    S-->>B: screen context
    B->>Q: BehaviorEvent (text_composed)
    end

    rect rgb(251, 229, 227)
    Note right of Q: BATCH SUMMARIZE (every 3 min, one LLM call)
    Q->>L: all BehaviorEvents from window
    Note right of L: Summarize activity
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
