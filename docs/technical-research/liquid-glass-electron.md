# Electron Liquid Glass & Vibrancy for Transparent HUD

**Date:** 2025-05-01
**Ticket:** IDE-134
**Environment:** Electron 41.3.0, macOS 26.2 (Tahoe), Apple Silicon

## Executive Summary

Electron 41.x supports 14 `NSVisualEffectView` vibrancy types on macOS, togglable at runtime via `win.setVibrancy()`. The best candidates for a floating HUD are **`under-window`** (frosted glass) and **`hud`** (dark translucent panel). Dynamic toggling works without flicker using the `animationDuration` option. The recommended approach is a **CSS overlay transition** on top of `under-window` vibrancy — animating background opacity from transparent (glass visible) to opaque (solid white) — which avoids vibrancy type-switching artifacts entirely.

Apple's new **Liquid Glass** material (macOS 26) is **not built into Electron**. A third-party package [`electron-liquid-glass`](https://github.com/Meridius-Labs/electron-liquid-glass) provides native bindings but adds a native module dependency. The traditional vibrancy API provides a good-enough glass effect for Tomato's HUD on macOS 13–26.

**Recommendation:** Use `vibrancy: 'under-window'` with a CSS overlay transition for IDE-133. No Electron upgrade required.

---

## 1. Vibrancy Types Tested

Electron 41.x supports these `NSVisualEffectMaterial` types via `BrowserWindow.vibrancy` and `win.setVibrancy()`:

| Type | Visual Effect | HUD Suitability |
|------|--------------|-----------------|
| `under-window` | Frosted glass, blurs desktop behind window | **Best for glass HUD** — clean, modern |
| `hud` | Dark translucent panel (system HUD style) | Good for dark-theme HUD |
| `popover` | Light blur, similar to macOS popovers | Decent, slightly lighter than under-window |
| `sidebar` | Matches Finder sidebar translucency | Too subtle for floating window |
| `header` | Header bar material | Minimal visible effect |
| `sheet` | Sheet/dialog material | Similar to under-window |
| `window` | Standard window background material | Subtle |
| `menu` | Context menu material | Very subtle |
| `tooltip` | Tooltip background | Barely visible |
| `selection` | Selection highlight material | Not useful for backgrounds |
| `content` | Content area material | Subtle |
| `fullscreen-ui` | Fullscreen UI overlay | Similar to under-window |
| `under-page` | Under web content blur | Similar to under-window |
| `titlebar` | Title bar material | Minimal effect |

**Deprecated and removed** (macOS 10.15+): `appearance-based`, `light`, `dark`, `medium-light`, `ultra-dark`.

### Best Choices for Tomato HUD

1. **`under-window`** — already used on the start/onboarding windows. Provides consistent frosted glass across macOS 13–26. The safest choice.
2. **`hud`** — system HUD material, designed for floating panels. Darker than `under-window`. Good if we want a dark-mode glass look.
3. **`popover`** — lighter variant, works well for small floating panels.

## 2. Liquid Glass (macOS 26 / Tahoe)

### Status: Not in Electron

Electron 41.x has **no native Liquid Glass support**. The Liquid Glass material (`NSGlassEffectView`) introduced in macOS 26 is a new AppKit view type separate from `NSVisualEffectView`.

**Relevant Electron issues:**
- [#47514](https://github.com/electron/electron/issues/47514) — Requests macOS 26 SDK compilation for rounded corners and new traffic light button styling. Open, no Liquid Glass discussion.
- [#48343](https://github.com/electron/electron/issues/48343) — Closed as duplicate of #47514.

There is no timeline for native Liquid Glass support in Electron.

### Third-Party Option: `electron-liquid-glass`

The [`electron-liquid-glass`](https://github.com/Meridius-Labs/electron-liquid-glass) package (v1.1.1) provides native `NSGlassEffectView` bindings:

- **Requirements:** macOS 26+, Electron 30+
- **API:** `liquidGlass.addView(handle, { cornerRadius, tintColor, opaque })`
- **Fallback:** Uses `NSVisualEffectView` on macOS 10.14–25.x
- **Warning:** Do NOT combine with `vibrancy` option — they conflict

**Assessment:** Adds a native module dependency and only benefits macOS 26+ users. Not recommended for initial implementation — the traditional vibrancy API looks nearly identical and works across macOS 13–26.

## 3. Dynamic Vibrancy Toggling

### Runtime `setVibrancy()` — Works

`win.setVibrancy(type)` can be called at runtime to change or remove vibrancy:

```typescript
// Enable glass
timerWin.setVibrancy('under-window');

// Disable glass (back to solid)
timerWin.setVibrancy(null);
```

### Animation Support

Electron supports animated vibrancy transitions:

```typescript
// Fade vibrancy in over 300ms
win.setVibrancy('under-window', { animationDuration: 300 });

// Fade vibrancy out over 300ms
win.setVibrancy(null, { animationDuration: 300 });
```

**Limitations:**
- `animationDuration` only works for on/off transitions (to/from `null`)
- Switching between different vibrancy **types** at runtime is **not animated** and may cause visual glitches
- `visualEffectState` is a **constructor-only** option — cannot be changed at runtime ([#25513](https://github.com/electron/electron/issues/25513), open since 2020)

### Flicker Risk

- Toggling vibrancy on/off with `animationDuration` produces a smooth fade — no flicker observed
- Switching between vibrancy types (e.g., `under-window` → `hud`) without going through `null` can cause a brief visual discontinuity
- [#45828](https://github.com/electron/electron/issues/45828) documents flicker when toggling window visibility properties

## 4. CSS Overlay Approach (Recommended)

The cleanest path for a transparent-to-solid HUD transition is a **CSS background overlay**:

1. Set `vibrancy: 'under-window'` on the `BrowserWindow` (always on)
2. Use CSS `background` with `transition` to animate between glass and solid:

```css
/* Solid mode (default) */
#session-timer {
  background: #FFFFFF;
  transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
}

/* Glass mode — transparent background reveals vibrancy beneath */
#session-timer.glass-mode {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 20px 44px rgba(0, 0, 0, 0.08),
    0 0 0 0.5px rgba(255, 255, 255, 0.4) inset;
}
```

**Why this is better than toggling `setVibrancy()`:**
- CSS transitions are GPU-accelerated and smooth
- No native vibrancy re-initialization cost
- The vibrancy layer stays active; only the CSS overlay opacity changes
- Works identically across macOS 13–26
- Simpler code — no IPC round-trip for the transition

### Transition Flow

```
Glass state:  vibrancy=under-window + background: rgba(255,255,255,0.15)
                → desktop blurs through window
Solid state:  vibrancy=under-window + background: #FFFFFF
                → solid white covers vibrancy (vibrancy still runs but invisible)
Transition:   CSS transition on background, 400ms ease
```

## 5. Text Legibility

### Challenge

With a transparent/glass background, text must remain readable over arbitrary desktop wallpapers (light, dark, colorful).

### Solutions Tested

| Technique | Effectiveness | Notes |
|-----------|--------------|-------|
| `text-shadow: 0 0 8px rgba(255,255,255,0.6)` | **Good** | Light glow behind dark text, works on most backgrounds |
| `backdrop-filter: blur(4px)` on text container | **Good** | Extra blur behind text area, adds contrast |
| Semi-opaque pill behind text (`rgba(0,0,0,0.1)`) | **Best** | Guaranteed readability, slight visual weight |
| Dark text (`#1A1A1A`) only | Fragile | Fails on dark wallpapers without shadows |
| White text with dark shadow | OK | Only for dark vibrancy types like `hud` |

**Recommendation:** Use `text-shadow` on primary text elements and a semi-opaque backing pill on critical UI (timer, status badge). This provides reliable contrast without obscuring the glass effect.

### Color Scheme

For `under-window` vibrancy (light frosted glass):
- Primary text: `#1A1A1A` with `text-shadow: 0 0 8px rgba(255,255,255,0.6)`
- Secondary text: existing colors with lighter text-shadow
- Interactive elements: `rgba(255,255,255,0.2)` background with `backdrop-filter: blur(4px)`

## 6. Pre-Tahoe Fallback (macOS 13–15)

On macOS 13–15 (Ventura through Sequoia), `vibrancy: 'under-window'` produces a **frosted glass effect** using `NSVisualEffectView`. This is the same API that has been stable since macOS 10.14 (Mojave).

The visual effect is nearly identical to macOS 26 Tahoe's vibrancy — the new Liquid Glass material is a separate, opt-in API. The traditional vibrancy API continues to work unchanged on macOS 26.

**No fallback code needed.** The same `vibrancy: 'under-window'` call produces appropriate translucency on all supported macOS versions.

## 7. Performance

### Vibrancy Rendering Cost

- `NSVisualEffectView` compositing is handled by the **WindowServer** process, not the app
- GPU cost is minimal — Apple optimizes this for always-visible system chrome
- The vibrancy layer renders regardless of whether it's visually covered by CSS — setting `vibrancy: null` when in solid mode would save a tiny amount of GPU, but the difference is negligible

### CSS Transition Performance

- `background` color transitions are composited on the GPU
- `backdrop-filter: blur()` has a measurable GPU cost but is small for the HUD's 360x220px size
- No CPU spikes observed during transitions on Apple Silicon

### Always-On-Top Concern

The HUD uses `alwaysOnTop: true`, which means WindowServer must composite it on every frame. Vibrancy adds blur compositing to this. On Apple Silicon, this is well within budget — the same composition happens for system control center, notification center, and Spotlight.

**Verdict:** No performance concern for the HUD's size and update frequency.

## 8. Window Type

### Current Setup

The timer window uses a regular `BrowserWindow` with `alwaysOnTop: true`, `skipTaskbar: true`, and `setVisibleOnAllWorkspaces(true)`. This behaves like a panel but isn't a native `NSPanel`.

### `type: 'panel'` Analysis

Using `type: 'panel'` would make the window a native `NSPanel`, which:
- Floats above fullscreen apps automatically
- Appears on all Spaces without `setVisibleOnAllWorkspaces`
- Has different focus behavior (doesn't steal focus from main app windows)

**Vibrancy works identically** on `type: 'panel'` windows. The `NSVisualEffectView` is independent of the window type.

**Recommendation:** Consider switching to `type: 'panel'` for IDE-133 for better macOS integration, but it's orthogonal to the vibrancy question.

## PoC: Glass/Solid Toggle

A working PoC is included in this branch with the following changes:

### Main Process (`src/main/main.ts`)

- Added `globalShortcut` for `Cmd+Shift+G` (toggle glass mode) and `Cmd+Shift+V` (cycle vibrancy types)
- Added IPC handlers `cycle-vibrancy` and `toggle-glass-mode`
- Vibrancy cycling iterates through all 14 types + null

### Renderer (`src/renderer/pages/HudPage.tsx`)

- Added `glassMode` and `currentVibrancy` state
- Shows vibrancy indicator when cycling
- Applies `glass-mode` CSS class for transparent styling

### CSS (`src/renderer/pages/HudPage.css`)

- Added `.glass-mode` styles with transparent backgrounds, text shadows, and border adjustments
- Smooth 400ms CSS transitions between glass and solid states
- Vibrancy indicator badge for testing

### How to Test

```bash
npm run dev
# Start a session (or grant permissions first)
# Cmd+Shift+G — toggle glass/solid mode
# Cmd+Shift+V — cycle through vibrancy types
```

## Recommended Implementation Path for IDE-133

### Phase 1: Basic Glass HUD (Low Risk)

1. Add `vibrancy: 'under-window'` to the timer `BrowserWindow` constructor
2. Add `visualEffectState: 'active'` so vibrancy appears even when window isn't focused
3. Implement CSS glass-mode styles with transition support
4. Default to **solid mode** — glass is opt-in or triggered by specific UX states

### Phase 2: Transition Behavior

1. Start session → HUD appears in glass mode (unobtrusive, transparent)
2. Drift detected / pause / important state → transition to solid mode (attention-grabbing)
3. User dismisses notification → fade back to glass
4. Use CSS transitions (400ms ease) for smooth state changes

### Phase 3: Optional Enhancements

1. User preference for default mode (glass vs solid) in settings
2. Consider `type: 'panel'` for better macOS window behavior
3. Evaluate `electron-liquid-glass` if macOS 26+ market share justifies the dependency

### Code Changes Required

```typescript
// Timer window creation (main.ts)
timerWin = new BrowserWindow({
  width: 360,
  height: 220,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  resizable: false,
  skipTaskbar: true,
  hasShadow: false,
  vibrancy: 'under-window',          // ADD
  visualEffectState: 'active',        // ADD
  webPreferences: { /* ... */ },
});
```

### macOS Version Requirements

- **Minimum:** macOS 10.14 (Mojave) — `NSVisualEffectView` vibrancy
- **No upgrade needed** for current Electron 41.x
- **Liquid Glass** requires macOS 26+ and `electron-liquid-glass` package (not recommended initially)

### Electron Version Requirements

- **Current Electron 41.3.0** is sufficient for all vibrancy features
- No Electron upgrade required
- The `animationDuration` option for `setVibrancy()` is available in current version

## Summary of Findings

| Question | Answer |
|----------|--------|
| Best vibrancy type for HUD? | `under-window` — clean frosted glass |
| Liquid Glass support? | Not in Electron natively; 3rd party available but unnecessary |
| Dynamic toggling viable? | Yes, with `animationDuration` for smooth transitions |
| CSS overlay better? | **Yes** — smoother, simpler, no IPC round-trip |
| Text legibility? | Solved with `text-shadow` + semi-opaque backing elements |
| Pre-Tahoe fallback? | Same `vibrancy` API works identically on macOS 13–26 |
| Performance concern? | None for HUD-sized window on Apple Silicon |
| Window type matter? | `type: 'panel'` improves UX but is orthogonal to vibrancy |
