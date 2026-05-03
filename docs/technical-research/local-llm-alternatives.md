# Local LLM Alternatives to Anthropic API

**Date:** 2026-05-02
**Status:** Research complete — go/no-go recommendation at bottom
**Linear:** IDE-143

## Executive Summary

We evaluated three local inference options — Apple Foundation Models, MLX Swift, and llama.cpp — as replacements for the Anthropic API (Claude Haiku) that powers Tomato's focus summarization and drift detection. All three are technically viable. Our recommendation is a **phased approach**: ship with **llama.cpp via llama-server** (broadest compatibility, simplest integration), then add **Apple Foundation Models** as a zero-download fast path on macOS 26+.

---

## Current Architecture

Tomato's LLM usage flows through a clean `LlmClient` interface (`src/main/llm-summarizer.ts`):

```
LlmClient
  ├── batchSummarize(timeline, intention, sessionContext) → BatchSummaryResult
  └── summarizeSession(intention, activities, durationMin) → SessionSummaryResult
```

**Batch summarization** (every 60s): receives a window activity timeline (typed text, app switches, URLs, accessibility hints, passive screen captures) and returns:
- 1–2 sentence summary
- Level-2 classification (Building, Research, Marketing, etc.)
- Drift assessment (isDrifting, confidence 0–1, reason)

**Session summarization** (end of pomodoro): receives aggregated batch summaries and returns a 2–3 sentence session summary with a focus score (0–100).

Both calls use `max_tokens: 300`. Prompts are ~500–1500 tokens depending on activity volume. Total round-trip is well under 4K tokens.

**Current model:** `claude-haiku-4-5-20251001` (~100+ tok/s effective, $1.00/MTok input, $5.00/MTok output).

The `LlmClient` interface makes swapping implementations straightforward — a local LLM client just needs to implement the same two methods.

---

## Option 1: Apple Foundation Models (macOS 26+)

### Overview

Apple's on-device ~3B transformer model, 2-bit quantized, running on the Neural Engine. Ships with the OS — zero download, zero bundle size. Available via the `FoundationModels` Swift framework starting macOS 26 (Tahoe).

### Key Specs

| Attribute | Value |
|---|---|
| Model size | ~3B params, 2-bit quantized |
| Context window | **4,096 tokens total** (input + output combined) |
| Languages | 15 |
| Structured output | Yes — `@Generable` macro for typed Swift structs |
| Tool calling | Yes — full `Tool` protocol |
| System prompts | Yes — `Instructions` builder |
| Safety guardrails | Mandatory, cannot be disabled |
| Requirements | Apple Silicon + macOS 26 + Apple Intelligence enabled |

### Integration Path

A Swift CLI sidecar binary, similar to how we bundle `screenpipe`. The open-source [apfel](https://github.com/Arthur-Ficial/apfel) project already wraps `LanguageModelSession` and exposes an OpenAI-compatible HTTP server at localhost — we could bundle this directly or build a minimal equivalent.

**Minimal Swift sidecar (stdin/stdout):**
```swift
import FoundationModels

let session = LanguageModelSession(instructions: "You are a focus coach.")
let response = try await session.respond(to: prompt)
print(response.content)
```

**Or run as a local HTTP server** and call from Electron via `fetch("http://localhost:11434/v1/chat/completions")`.

### Quality Assessment

The model is optimized for summarization, classification, and extraction — which aligns well with our use case. It is NOT strong at complex reasoning, code generation, or world knowledge. For batch summarization (structured JSON output with summary + classification + drift), quality should be acceptable.

**Critical constraint:** The 4,096 token context window is shared between input and output. Our batch prompts (system instructions + timeline data + response) typically total 800–2000 tokens, which fits. But longer activity windows with verbose keystroke data could push close to the limit. The prompt would need to be tuned to stay well under 4K.

### Pros
- Zero cost, zero download, zero bundle size overhead
- Fastest time-to-first-token (Neural Engine, not GPU)
- No API key needed — users get value immediately
- Privacy-perfect: nothing leaves the device, ever
- Structured output via `@Generable` is type-safe and reliable
- Apple-maintained, will improve with each macOS release

### Cons
- **macOS 26+ only** — excludes all users on macOS 15 (Sequoia) and earlier
- Apple Intelligence must be enabled by user
- 4,096 token context window is tight
- Mandatory guardrails may block edge cases (unlikely for our prompts)
- No Intel Mac support
- Cannot control model choice or version
- No way to test quality until macOS 26 ships (currently in beta)

### Verdict

Excellent as a **fast path** for macOS 26+ users. Not viable as the sole solution due to the OS version requirement.

---

## Option 2: MLX Swift

### Overview

Apple's open-source ML framework optimized for Apple Silicon unified memory. Run any quantized open model (Llama-3.2-3B, Phi-3-mini, etc.) via the `mlx-swift-lm` library. Requires macOS 14+.

### Key Specs

| Attribute | Value |
|---|---|
| Target model | Llama-3.2-3B-Instruct-4bit |
| Model file size | 1.81 GB (Q4) |
| RAM usage | ~2.0–2.5 GB at inference |
| Generation speed (M1 base) | ~40–50 tok/s |
| Generation speed (M1 Pro/Max) | ~80–120 tok/s |
| Generation speed (M3 Pro) | ~60–80 tok/s |
| Context window | 4K–8K tokens (model-dependent) |
| Requirements | macOS 14+, Apple Silicon, Xcode for build |

### Integration Path

Swift sidecar binary built with `mlx-swift-lm`. Must be compiled with `xcodebuild` (not plain `swiftc`) because MLX requires Metal shader compilation.

**Critical build requirement:** The compiled binary requires `mlx.metallib` (Metal shader library) to be bundled alongside it. Missing this file causes silent GPU failures.

```
Electron Main Process
  └── child_process.spawn("tomato-llm", ["--prompt", "..."])
        └── Swift binary (MLX) → Metal GPU
              └── reads model from ~/Library/Application Support/tomato/models/
              └── writes JSON to stdout
```

### Performance Analysis

For our use case (300 max output tokens, ~1000 input tokens):
- **M1 base:** ~1–2s prompt processing + ~6–7s generation = **~8–9s total**
- **M1 Pro/Max:** ~0.5–1s prompt processing + ~2–4s generation = **~3–5s total**
- **M3 Pro:** ~1s prompt processing + ~4–5s generation = **~5–6s total**

All well within our 60-second batch window.

### Model Management

Models must be downloaded from Hugging Face on first run (1.81 GB for Llama-3.2-3B-4bit). The app would need to handle:
- First-run download with progress indication
- Model caching in `~/Library/Application Support/tomato/models/`
- Verifying model integrity

### Pros
- 20–87% faster than llama.cpp on Apple Silicon (memory bandwidth advantage)
- Apple-maintained, featured at WWDC 2025
- Rich Swift API with streaming, structured output
- Choose any open model — can upgrade as better models release
- macOS 14+ support (broader than Apple FM)

### Cons
- **Swift-only** — requires Xcode toolchain for building
- Must bundle `mlx.metallib` alongside binary
- Model download on first run (1.81 GB)
- Apple Silicon only — no Intel, no cross-platform
- More complex build pipeline than llama.cpp
- Cold start (model loading) takes ~5–10s — sidecar must stay warm
- Heavier developer tooling requirement (Xcode, Swift package manager)

### Verdict

Best raw performance on Apple Silicon, but the Swift build complexity and Apple-only constraint make it less practical than llama.cpp as a primary solution. Good as a performance-optimized backend if we decide to invest in the Swift toolchain.

---

## Option 3: llama.cpp (Recommended Primary)

### Overview

Plain C/C++ LLM inference engine with zero dependencies. The `llama-server` binary exposes an OpenAI-compatible HTTP API. Models use the GGUF format. Metal GPU acceleration is built-in and automatic on macOS.

### Key Specs

| Attribute | Value |
|---|---|
| Target model | Llama-3.2-3B-Instruct-Q4_K_M |
| Model file size | ~2.0 GB (Q4_K_M) |
| RAM usage | ~2.8–3.3 GB total (weights + KV cache + overhead) |
| Generation speed (M1 base) | ~40–60 tok/s |
| Generation speed (M1 Pro/Max) | ~60–80 tok/s |
| Generation speed (M3 Pro) | ~60–80 tok/s |
| Context window | Configurable, 4K default |
| Server binary size | ~5–10 MB |
| Requirements | macOS 14+, Apple Silicon (Metal) |

### Integration Path: llama-server Sidecar

This mirrors our existing `screenpipe` sidecar pattern exactly:

1. Bundle `llama-server` binary in `bin/` (→ `Contents/Resources/` in packaged app)
2. Start on app launch: `llama-server -m model.gguf -ngl 99 -c 4096 --port 8081`
3. Call from Electron via OpenAI-compatible API:

```typescript
const response = await fetch('http://localhost:8081/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'local',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: batchPrompt }
    ],
    max_tokens: 300,
    temperature: 0.3
  })
});
```

**New `LlmClient` implementation** would be ~50 lines — just HTTP calls to localhost with JSON parsing.

### Performance Analysis

For our use case (300 max output tokens, ~1000 input tokens):
- **M1 base:** ~2–3s prompt processing + ~5–7s generation = **~7–10s total**
- **M1 Pro/Max:** ~1–2s prompt processing + ~4–5s generation = **~5–7s total**

Well within the 60-second batch window. Users would experience a brief pause before each summary appears.

### Alternative: node-llama-cpp (In-Process)

The [node-llama-cpp](https://node-llama-cpp.withcat.ai/) package provides direct Node.js bindings with pre-built Metal-enabled binaries. This runs inference inside the Electron main process (or a worker).

**Pros vs sidecar:** No process management, no HTTP overhead, richer API (JSON schema enforcement via grammar).
**Cons vs sidecar:** Native module ABI issues (same problem as better-sqlite3), GPU crash takes down Electron, more complex packaging.

**Recommendation:** Start with llama-server sidecar for simplicity and process isolation. Consider node-llama-cpp later if we need tighter integration.

### Pros
- **OpenAI-compatible API** — minimal code change, can swap between local and cloud
- **Matches existing sidecar pattern** — same as screenpipe/ffmpeg bundling
- **Cross-platform potential** — same engine works on Linux/Windows if we ever expand
- **Broad model support** — thousands of GGUF models on Hugging Face
- **Active community** — 1000+ contributors, rapid development
- **Simple build** — `cmake` produces a single static binary
- **Process isolation** — LLM crash doesn't crash Electron
- Single binary, no Metal shader library to bundle separately

### Cons
- 10–30% slower than MLX on Apple Silicon
- Model download on first run (~2 GB)
- Must manage server process lifecycle (start/stop/health check)
- Binary needs code signing for distribution (already handled by `scripts/sign.sh`)
- ~5–10 MB added to app bundle (just the server binary, not the model)

### Verdict

**Best overall choice for primary local inference.** Simplest integration path (matches existing architecture), broadest compatibility, cross-platform optionality, and the OpenAI-compatible API means minimal code changes.

---

## Comparison Matrix

| Criterion | Apple FM | MLX Swift | llama.cpp |
|---|---|---|---|
| **Quality (est.)** | Good (tuned for extraction) | Model-dependent | Model-dependent |
| **Speed (M1 base)** | Fast (Neural Engine) | ~40–50 tok/s | ~40–60 tok/s |
| **RAM usage** | ~0 (OS-managed) | ~2.0–2.5 GB | ~2.8–3.3 GB |
| **Bundle size added** | 0 | ~5 MB binary + metallib | ~5–10 MB binary |
| **Model download** | None (ships with OS) | 1.81 GB | 2.0 GB |
| **Min macOS** | **26 (Tahoe)** | 14 (Sonoma) | 14 (Sonoma) |
| **Intel Mac** | No | No | No (Metal req.) |
| **Cross-platform** | No | No | **Yes** |
| **Integration effort** | Medium (Swift sidecar) | High (Xcode + metallib) | **Low (HTTP API)** |
| **API compatibility** | Custom | Custom | **OpenAI-compatible** |
| **Process isolation** | Yes (sidecar) | Yes (sidecar) | **Yes (server)** |
| **Privacy** | Full | Full | Full |
| **Cost per query** | $0 | $0 | $0 |

---

## Research Question Answers

### 1. Quality: Can a 3B model produce usable summaries and classifications?

**Likely yes, with caveats.** Our prompts are well-structured extraction tasks (summarize activity, classify into 7 categories, assess drift). These are the sweet spot for small models — especially with JSON schema enforcement (available in llama.cpp via grammar constraints). The nuanced parts (drift confidence calibration, distinguishing "research for the task" from "browsing") will be lower quality than Haiku, but should be actionable.

**Mitigation:** Use conservative drift thresholds (raise confidence threshold from 0.6 to 0.75 for local models), simplify prompts, and enforce JSON output via grammar.

**Validation needed:** Run the actual prompts against Llama-3.2-3B-Instruct with real screenpipe data and compare outputs side-by-side with Haiku. This is the critical next step before committing to implementation.

### 2. Latency: Wall-clock time for a 3-minute batch summarization?

| Machine | llama.cpp (est.) | MLX Swift (est.) | Apple FM (est.) |
|---|---|---|---|
| M1 base (8 GB) | 7–10s | 8–9s | 2–4s |
| M1 Pro (16 GB) | 5–7s | 3–5s | 2–3s |
| M3 Pro (18 GB) | 5–7s | 5–6s | 2–3s |

All are well within the 60-second batch window. Users will notice a brief processing delay but it won't block the workflow.

### 3. Resource usage: RAM/GPU alongside screenpipe + Electron?

**Memory budget on 8 GB M1 (worst case):**
- macOS + system services: ~2.5 GB
- Electron (renderer + main): ~300–500 MB
- screenpipe: ~200–400 MB
- Local LLM (3B Q4): ~2.5–3.3 GB
- **Total: ~5.5–6.7 GB** — tight but feasible on 8 GB

**On 16 GB machines:** Comfortable, ~9 GB free headroom.

**Recommendation:** Use the 1B model variant (Llama-3.2-1B-Instruct, ~0.8 GB download, ~1.2 GB RAM) on 8 GB machines if memory pressure is detected.

### 4. App size: What does bundling add?

| Component | Size |
|---|---|
| Current app (.app) | ~50 MB |
| llama-server binary | ~5–10 MB |
| Model (NOT bundled — downloaded on first run) | 2.0 GB (3B) or 0.8 GB (1B) |

**App bundle increase: ~5–10 MB** (just the server binary). The model is downloaded to `~/Library/Application Support/tomato/models/` on first launch, with a progress UI.

### 5. Platform lock-in: Apple FM requires macOS 26+ — what's the fallback?

**llama.cpp is the fallback.** It supports macOS 14+ with Metal. The architecture would be:

```
if macOS >= 26 && Apple Intelligence enabled:
  use Apple Foundation Models (zero download, fastest)
else if Apple Silicon:
  use llama-server + downloaded GGUF model
else:
  use Anthropic API (requires API key)
```

### 6. Integration complexity: Which has the simplest Electron integration?

**llama.cpp wins decisively.**

| Option | Integration Approach | Complexity |
|---|---|---|
| llama.cpp | HTTP server sidecar, OpenAI-compatible API | **Low** — matches existing screenpipe pattern |
| Apple FM | Swift sidecar binary (stdin/stdout or HTTP) | Medium — requires Swift toolchain |
| MLX Swift | Swift sidecar + Metal shader lib | High — Xcode build, metallib bundling |

---

## Recommended Architecture

### Phase 1: llama-server sidecar (ship first)

```
Electron Main Process
  ├── screenpipe (existing sidecar)
  ├── llama-server (new sidecar)
  │     └── Llama-3.2-3B-Instruct-Q4_K_M.gguf
  │         (downloaded to ~/Library/Application Support/tomato/models/)
  └── LlmClient implementations:
        ├── AnthropicLlmClient (existing — cloud API)
        └── LocalLlmClient (new — calls localhost:8081)
```

**First-run experience:**
1. App detects no model downloaded
2. Shows download progress UI (~2 GB, ~1–3 min on broadband)
3. Starts llama-server sidecar
4. User starts first pomodoro — no API key needed

**Fallback:** If model download fails or user prefers cloud quality, they can enter an Anthropic API key and use `AnthropicLlmClient` instead.

### Phase 2: Apple Foundation Models fast path (macOS 26+)

When macOS 26 ships (fall 2026), add a third `LlmClient` implementation that calls the Foundation Models framework via a tiny Swift sidecar. On macOS 26+ machines, this becomes the default — zero download, fastest inference, best privacy story.

```
LlmClient selection:
  1. Apple FM (macOS 26+, Apple Intelligence on) → zero setup
  2. llama-server (macOS 14+, Apple Silicon) → 2 GB download
  3. Anthropic API (any platform, requires API key) → cloud
```

---

## Go / No-Go Recommendation

### Go — with staged rollout

Local inference should replace the Anthropic API as the **default** path. The strategic case is compelling:

1. **Eliminates API key friction** — the #1 barrier to first-time value
2. **Zero marginal cost** — no per-query charges, ever
3. **Privacy-first** — no data leaves the device, reinforces brand
4. **Offline capable** — works without internet after model download

### Conditions for Go

1. **Quality validation (blocking):** Run real screenpipe batch data through Llama-3.2-3B-Instruct and compare outputs with Haiku side-by-side. If classification accuracy drops below ~80% or summaries are unusably vague, consider the 8B model (larger download, more RAM) or keep cloud as default.

2. **8 GB Mac testing (blocking):** Verify that Electron + screenpipe + llama-server + 3B model runs without swap pressure on an 8 GB M1. If it doesn't, default to the 1B model on low-memory machines.

3. **First-run download UX:** Design a smooth model download experience. A 2 GB download on first launch needs clear progress indication and the ability to cancel/retry.

### What we'd keep the Anthropic API for

- Users who explicitly prefer cloud quality
- Machines where local inference is too slow or memory-constrained
- Future features that require frontier model capabilities (e.g., complex multi-step reasoning)

---

## Next Steps

1. **Prototype:** Build a `LocalLlmClient` that calls llama-server's OpenAI-compatible endpoint
2. **Benchmark quality:** Feed 20+ real batch prompts to Llama-3.2-3B-Instruct-Q4_K_M, compare outputs with Haiku ground truth
3. **Benchmark resources:** Measure RAM/CPU on 8 GB M1 with full stack running
4. **First-run UX:** Design model download flow
5. **macOS 26 beta:** When available, prototype Apple FM integration and compare quality

---

## References

- [Apple Foundation Models framework](https://developer.apple.com/documentation/foundationmodels) — WWDC25
- [MLX Swift](https://github.com/ml-explore/mlx-swift) — Apple ML research
- [mlx-swift-lm](https://github.com/ml-explore/mlx-swift-lm) — high-level LLM library
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — ggml-org
- [node-llama-cpp](https://node-llama-cpp.withcat.ai/) — Node.js bindings
- [apfel](https://github.com/Arthur-Ficial/apfel) — Apple FM CLI wrapper
- [Llama-3.2-3B-Instruct-Q4_K_M GGUF](https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF) — Hugging Face
- [mlx-community models](https://huggingface.co/mlx-community) — pre-quantized MLX models
- [MLX vs llama.cpp comparison](https://groundy.com/articles/mlx-vs-llamacpp-on-apple-silicon-which-runtime-to-use-for-local-llm-inference/)
- [Apple Foundation Models tech report](https://arxiv.org/pdf/2507.13575)
