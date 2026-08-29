# Tomato UI modernization — build status

A unit is ✅ only when `npm run verify` (typecheck + test) exits 0 AND, for any
unit touching visual UI, a screenshot was taken and vision-verified against
the prior look. Never mark a unit done aspirationally.

## Environment (already provisioned — do NOT re-provision)
- Repo: `~/workspace/tomato`, branch `oliverswitzer/ide-hud-cleanup-and-tailwind`
- Node 22+, npm. `npm run typecheck` and `npm test` (159 tests) are the
  verify gates — there is no single `npm run verify` script, run both:
  `npm run typecheck && npm test`
- Tailwind v4 already installed and wired via `@tailwindcss/vite` in
  `vite.config.ts`, `@import "tailwindcss";` in `src/renderer/index.css`.
  Nothing to install for Tailwind itself.
- `npm run dev` — Vite + Electron with hot reload, for visual verification.

## Progress
- ✅ glass-cleanup (pre-existing, done live) — removed electron-liquid-glass,
  vibrancy/transparent flags, lg-* CSS variants; HUD auto collapses on-track,
  expands + flashes red on drift. 159 tests green, typecheck green.
- ✅ U01 zustand session store — added `zustand`, new `src/renderer/store/sessionStore.ts`
  (state/activities/driftInfo/apiError/sessionEnded + `initSessionStore()` wiring all
  `window.tomato.on*` IPC listeners), called once from `App.tsx`. `HudPage.tsx` now reads
  via store selectors (kept `isExpanded`/`manualOverride` as local state per plan). 10 new
  vitest cases for the store (activity cap at 100, drift reset on new activity, etc.).
  Verified visually via a temporary (not committed) dev-mode IPC mock + browser screenshot:
  on-track, expanded, and simulated-drift states all render correctly with no regression.
  169/169 tests green, typecheck green.
- ✅ U02 migrate remaining pages onto the store — `NudgePage.tsx` was the only
  page duplicating shared state via IPC (`getSessionState` for `intention`);
  switched it to `useSessionStore((s) => s.state.intention)`. Audited
  StartPage/SettingsPage/ApiKeyPage/PermissionsPage/DebugDashboard: all
  remaining `window.tomato.*` calls are genuinely page-local (settings form
  fields, onboarding checks, debug-only pipeline/timeline polling) per the
  plan's carve-out, so left untouched. Verified visually via a temporary
  (not committed) dev-mode `window.tomato` mock in `main.tsx` + browser
  screenshot: nudge bubble renders with intention text pulled from the
  store, matching prior look (serif italic text, cream/red buttons), no
  regression. 169/169 tests green, typecheck green.
- ⬜ U03 reusable tailwind ui components
- ⬜ U04 migrate HudPage to tailwind
- ⬜ U05 migrate StartPage to tailwind
- ⬜ U06 migrate NudgePage to tailwind
- ⬜ U07 migrate SettingsPage to tailwind
- ⬜ U08 migrate ApiKeyPage + PermissionsPage to tailwind
- ⬜ U09 migrate DebugDashboard to tailwind
- ⬜ U10 dead code + lint pass
- ⬜ U11 docs + final verify
