# ADR 002: Batch LLM summarization over per-event calls

**Date:** 2026-04-25
**Status:** Accepted

## Context

The original pipeline called Claude Haiku on every typing pause (every few seconds when actively typing). This was expensive, produced fragmented summaries, and sent half-typed text to the LLM. The LLM would sometimes respond with "I can't summarize this" when given incomplete context.

Through testing, we found that a 3-minute window of accumulated activity gives the LLM enough context to produce coherent summaries and accurate drift detection in a single call.

## Decision

One LLM call every 3 minutes instead of per typing event. The call receives the full activity timeline for the window and returns:

1. **Summary** — 1-2 sentence description of what the user did
2. **Level 2 classification** — Building, Research, Marketing, User Validation, Admin, Communication, or Off-task
3. **Drift assessment** — is the user still on their stated intention, with confidence score and reason

The timeline builder collapses consecutive typing events in the same app/window into single entries to reduce token count.

A separate LLM call at session end summarizes the entire session and produces a focus score (0-100%).

## Consequences

- ~8 LLM calls per 25-minute session instead of potentially hundreds
- Summaries are more coherent with full context
- No half-typed text reaches the LLM
- 3-minute delay before the first activity appears in the HUD
- Drift detection has a 3-minute lag (acceptable for gentle nudges)
- The 15-second tick still updates the debug dashboard with raw timeline data (no LLM)
