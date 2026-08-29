# Tomato — architecture invariants for this build

- **Renderer state**: session/activity/drift/apiError state that mirrors
  main-process IPC push events lives in a single Zustand store
  (`src/renderer/store/sessionStore.ts`), initialized ONCE from `App.tsx`.
  Do not re-subscribe to `window.tomato.on*` listeners per-page — that was
  the old pattern and re-introducing it defeats the point of the refactor.
  Purely local/page-specific UI state (form inputs, `isExpanded` toggles,
  hover state) stays as component `useState` — do not force everything into
  the global store.
- **Styling**: Tailwind utility classes on JSX, no new per-page `.css`
  files. Shared visual primitives live in `src/renderer/components/ui/`
  (Button, Card, Badge, ProgressBar, IconButton) — reach for one of those
  before writing new utility-class soup for the same visual pattern twice.
  Theme colors (the existing cream/red palette) belong in Tailwind's
  `@theme` block in `index.css`, not hardcoded hex strings in components.
- **IPC contracts unchanged**: `src/shared/ipc.ts` and `src/preload/preload.ts`
  define the main<->renderer contract. This build does not change what the
  main process sends — only how the renderer stores/renders it. If a unit
  finds itself editing `src/main/*.ts` for anything other than removing
  genuinely dead code, stop and record it in KNOWN-GAPS.md instead of doing it.
- **Electron window chrome (transparent/frame:false/hasShadow) is
  main-process only** — do not touch `src/main/main.ts` window flags in this
  build; that was already handled in the glass-cleanup commit.
- **Tests**: `vitest` for logic (store, utils). No new browser/e2e test
  framework — visual verification is screenshot + `vision_analyze`, not an
  automated visual regression suite, unless a later unit explicitly adds one.
