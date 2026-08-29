# Tomato UI modernization — PLAN

Goal: migrate the renderer to Tailwind utility classes + a small reusable
component library, and replace ad-hoc `useState`/`useEffect` wiring with a
Zustand store for session/activity/drift/error state. Clean up dead code as
you go.

Why Zustand: no Context/Provider ceremony, no reducer boilerplate, plain
functions for actions, trivial to inspect (`store.getState()` in devtools),
works fine with Electron IPC callbacks (call `set()` from the IPC handler).
It is the lowest-ceremony state manager that is still "real" (selectors,
no re-render storms) — do not swap it for Redux/Recoil/Jotai without asking.

Each unit = one driver iteration = one commit. `npm run verify` (typecheck +
test) MUST be green before every commit. Screenshot + `vision_analyze` any
page you touch visually before marking it done — a green build does not
prove the page still looks right.

## U01 — Zustand store: session/activity/drift/error state [depends: none]
- `npm install zustand`
- New `src/renderer/store/sessionStore.ts`: a single store holding
  `state` (SessionStateWithActivities), `activities`, `driftInfo`,
  `apiError`, `sessionEnded` — the same shape HudPage currently keeps in
  five separate `useState` calls.
- One `initSessionStore()` function that wires all the
  `window.tomato.onSessionState` / `onActivityUpdate` / `onDriftDetected` /
  `onSessionEnded` / `onApiError` IPC listeners into `set()` calls, returns
  an unsubscribe function. Call it once from `App.tsx` (not per-page) so
  page navigation doesn't re-subscribe/lose state.
- Migrate `HudPage.tsx` to read from the store via selectors instead of its
  own `useState`/`useEffect` IPC wiring. Keep `isExpanded` and
  `manualOverride` as local component state (UI-only, not shared).
- Tests: add `src/renderer/store/__tests__/sessionStore.test.ts` covering
  the reducer-ish `set()` calls (activity list capped at 100, drift reset on
  new activity, etc. — copy the existing logic's behavior, don't change it).
- `npm run verify` green. Screenshot HUD in both on-track and simulated
  drift state (can fake by calling the store's setter from devtools) to
  confirm no regression from the refactor alone (no Tailwind yet).

## U02 — Migrate remaining pages onto the store [depends: U01]
- `NudgePage.tsx` and any other page reading session/drift state directly
  via `window.tomato.on*` should read from the shared store instead of
  duplicating IPC subscriptions.
- `StartPage.tsx`, `SettingsPage.tsx`, `ApiKeyPage.tsx`,
  `PermissionsPage.tsx`, `DebugDashboard.tsx` — leave IPC calls that are
  genuinely page-local (e.g. settings form fields, debug-only state) as
  local `useState`. Only move state that's shared across pages or mirrors
  main-process push events into the store.
- Verify green, screenshot any page touched.

## U03 — Reusable Tailwind UI components [depends: none, can run parallel to U01/U02]
- New `src/renderer/components/ui/`: `Button.tsx`, `Card.tsx`, `Badge.tsx`,
  `ProgressBar.tsx`, `IconButton.tsx`. Each is a small typed component
  wrapping Tailwind utility classes (variants via a `cva`-style prop or
  simple ternary — don't add a new dependency for this unless `cva` is
  already trivial to install; if so `npm install class-variance-authority`
  is fine).
- These should visually match current colors/spacing (see HudPage.css /
  StartPage.css for the existing palette: `#2A2A2A` text, `#EFE8DD`
  borders, `#E2574C` red accent, `Inter`/`Newsreader`/`Geist Mono` fonts).
  Encode the palette as Tailwind theme tokens in `tailwind.config` (or the
  v4 `@theme` block in `index.css`) rather than hardcoding hex per-component.
- No page migration yet — just the library + a Storybook-less smoke test
  (render each in a throwaway test page or vitest + `@testing-library/react`
  snapshot, whichever is less setup).

## U04 — Migrate HudPage to Tailwind [depends: U01, U03]
- Replace `HudPage.css` with Tailwind utility classes on the JSX, using the
  U03 components (`Card`, `Badge` for the status pill, `ProgressBar`,
  `IconButton` for expand toggle).
- Keep the `glow-drift` red pulse animation — express it as a Tailwind
  `animate-*` custom keyframe in the theme config, not inline CSS.
- Delete `HudPage.css` entirely once nothing imports it.
- Screenshot on-track (collapsed) and drift (expanded, red pulse) states.

## U05 — Migrate StartPage to Tailwind [depends: U03]
- Replace `StartPage.css` with Tailwind + U03 components. Delete the CSS
  file. Screenshot before/after.

## U06 — Migrate NudgePage to Tailwind [depends: U01 (if store touched it), U03]
- Replace `NudgePage.css` with Tailwind + U03 components. Delete the CSS file.

## U07 — Migrate SettingsPage to Tailwind [depends: U03]
- Largest remaining page (477 lines). Use `Button`/`Card`/`ModelPicker`
  (leave `ModelPicker.tsx` logic alone, just restyle its markup with
  Tailwind if it has inline styles).

## U08 — Migrate ApiKeyPage + PermissionsPage to Tailwind [depends: U03]
- Both are simple onboarding-style pages, do together as one unit.

## U09 — Migrate DebugDashboard to Tailwind [depends: U03]
- Dev-only page, lower priority — fine to simplify rather than pixel-match.

## U10 — Dead code + lint pass [depends: U01–U09]
- Grep for unused exports, orphaned CSS files, unused imports across
  `src/renderer`. If `ts-prune` or `knip` installs cleanly use it; otherwise
  manual grep is fine — don't burn a unit fighting a new dev-dependency.
- Remove any remaining plain `.css` page files that are now dead.
- `npm run verify` green, `npm run typecheck` green, no unused-import
  warnings.

## U11 — Docs + final verify [depends: U10]
- Update `CLAUDE.md`: note Tailwind is now the styling approach, Zustand is
  the state store, and where the `ui/` component library lives.
- Full `npm run verify`, full click-through screenshot pass of every page
  (Start, Settings, ApiKey, Permissions, HUD on-track, HUD drift, Debug).
- This is the last unit — after this, STATUS.md should show all ✅.

## Cuts if time runs short
Droppable, in order: U09 (Debug dashboard) → U08 (onboarding pages) →
U10 (dead-code pass, but at minimum delete orphaned CSS files). NEVER cut
U01–U04 (HUD is the core UI the user actually looks at) or U11's final verify.
