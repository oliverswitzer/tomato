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
- ✅ U03 reusable tailwind ui components — added `src/renderer/components/ui/`
  (`Button`, `Card`, `Badge`, `ProgressBar`, `IconButton`) as small typed
  components delegating class-name assembly to a plain-function `variants.ts`
  (no new `cva` dependency needed — ternary/lookup-table variants were
  trivial enough). Palette encoded as Tailwind v4 `@theme` tokens in
  `index.css` (`--color-text/muted/subtle/border/cream/accent/accent-dark`,
  `--font-serif/--font-mono`) matching the existing HudPage/StartPage hex
  values exactly, no hardcoded hex in the new components. 7 new vitest
  cases cover variant/size class output and the `clampPercent` helper
  (no `@testing-library/react` — plain function tests were less setup and
  still exercise all variant branches). No pages migrated yet (U04+).
  Verified visually via a temporary (not committed) smoke page rendering
  all five components + a temporary `window.tomato` mock in `index.html`;
  screenshot + vision_analyze confirmed cream/red editorial palette,
  correct serif/mono fonts, and no visual breakage, then both the smoke
  page and the index.html mock were removed before commit. 176/176 tests
  green, typecheck green.
- ✅ U04 migrate HudPage to tailwind — rewrote `HudPage.tsx` to Tailwind
  utility classes on JSX, using the U03 `Badge` (status pill), `ProgressBar`,
  and `IconButton` (expand toggle) components; deleted `HudPage.css`
  entirely (no remaining imports). The `glow-drift` red pulse animation is
  now a Tailwind v4 `@theme` `--animate-drift-pulse` token backed by a
  `drift-pulse` `@keyframes` in `index.css` (kept the keyframe itself in
  plain CSS since Tailwind v4 doesn't have a JS keyframe API, but it's
  registered as a first-class `animate-*` utility per the plan). Kept
  `apiError` banner and drift/timeline sections as utility-class markup
  (no existing `ui/` primitive fit those without over-abstracting for a
  single call site). Verified visually via a temporary (not committed)
  dev-mode `window.tomato` mock in `main.tsx` (toggled by a `?drift=1`
  query param) + `npm run dev` + browser screenshot: on-track collapsed
  state and drift/expanded state (red pulsing border, off-track box,
  timeline entries, pause/end-session buttons) both render correctly,
  matching the prior look — cream/red palette, serif body/italic activity
  text, monospace timer, no regressions. Mock and its main.tsx changes
  were reverted before commit (not part of the shipped diff). 176/176
  tests green, typecheck green.
- ✅ U05 migrate StartPage to tailwind — rewrote `StartPage.tsx` to Tailwind
  utility classes on JSX (drag handle, close button, headline, intention
  textarea + char counter, recent/suggested chips, timer-length picker,
  screen-permission warning, start button, recent-sessions list), using the
  U03 `Button` (primary variant, custom shadow classes preserved) and `Card`
  (recent-session cards) components; deleted `StartPage.css` entirely (no
  remaining imports). Kept per-chip/dot inline `style` for dynamic hex
  colors (same pattern as HudPage/U04) since Tailwind can't express
  runtime-computed colors without arbitrary-value class strings per color.
  Verified visually via a temporary (not committed) dev-mode `window.tomato`
  mock in `main.tsx` + `npm run dev` + browser screenshot: headline/input/
  chips/timer-options/start-button and the scrolled recent-sessions section
  both render correctly — cream/red editorial palette, serif headline/body,
  correct chip dots, selected-timer highlight, no regressions. Mock was
  reverted before commit (not part of the shipped diff). 176/176 tests
  green, typecheck green.
- ✅ U06 migrate NudgePage to tailwind — rewrote `NudgePage.tsx` to Tailwind
  utility classes on JSX (bubble container, nudge text, button row), using
  the U03 `Button` component (secondary/primary variants, sm size) for
  "Pause session"/"Refocus"; deleted `NudgePage.css` entirely (no remaining
  imports). Kept `[-webkit-app-region:drag]`/`no-drag` as Tailwind arbitrary
  properties since there's no utility equivalent. Verified visually by
  hitting the Vite dev server directly at `http://localhost:5173/?mock=1#/nudge`
  with a temporary (not committed) `window.tomato` mock + hash-route branch
  in `main.tsx` (simpler than the Electron-window screenshot path used in
  prior units, same end result) + browser screenshot: white rounded bubble,
  serif italic nudge text, cream secondary / red primary buttons, matching
  the prior look, no regressions. Mock was reverted before commit (not part
  of the shipped diff). 176/176 tests green, typecheck green.
- ✅ U07 migrate SettingsPage to tailwind — rewrote `SettingsPage.tsx` and
  `ModelPicker.tsx` to Tailwind utility classes on JSX (modal overlay, key
  input/edit/connected states, error banner, toast, model dropdown), using
  the U03 `Button` (primary variant) for the Save action. Kept a handful of
  one-off inline hex values (`#E8E1D7` border, `#EEF6E3`/`#5A7A2F` connected
  badge, `#FBE9E7`/`#7A2E25` error banner, `#B86B60` link text, toast
  background) as Tailwind arbitrary-value classes rather than adding new
  `@theme` tokens for colors that only appear once in this page — no new
  per-page `.css` file, no remaining inline `style={{}}` blocks except the
  genuinely dynamic `no-drag` region removed in favor of the arbitrary
  property `[-webkit-app-region:no-drag]` pattern used elsewhere. `ModelPicker`
  had no logic changes, only markup restyled per the plan's carve-out.
  Verified visually via a temporary (not committed) dev-mode `window.tomato`
  mock + a `?mock=1` render branch in `main.tsx` + `npm run dev`-equivalent
  Vite server + browser screenshot: connected/saved state, key-editing state,
  and the open model dropdown (with cost labels, red-highlighted selected
  row) all render correctly — cream/red editorial palette, serif headline,
  monospace key/model text, no regressions. Mock and its main.tsx changes
  were reverted before commit (not part of the shipped diff). 176/176 tests
  green, typecheck green.
- ⬜ U08 migrate ApiKeyPage + PermissionsPage to tailwind
- ⬜ U09 migrate DebugDashboard to tailwind
- ⬜ U10 dead code + lint pass
- ⬜ U11 docs + final verify
