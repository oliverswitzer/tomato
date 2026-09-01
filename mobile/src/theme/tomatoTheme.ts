/**
 * Tomato editorial theme, ported for React Native.
 *
 * MIRRORS the Electron app's Tailwind `@theme` tokens defined in
 * `src/renderer/index.css` (root Electron package, NOT this mobile package).
 * Tailwind `@theme` CSS custom properties cannot be consumed directly by
 * React Native, so these hex/font values are hand-copied here.
 *
 * If the palette or fonts in `src/renderer/index.css` change, this file must
 * be updated to match by hand — there is no shared build step reconciling
 * the two today. See KNOWN-GAPS.md for the reconciliation plan.
 */

export const tomatoColors = {
  text: '#2A2A2A',
  muted: '#8B8477',
  subtle: '#BAA898',
  border: '#EFE8DD',
  cream: '#FBF7F1',
  accent: '#E2574C',
  accentDark: '#D04A3F',
} as const;

/**
 * Font families as named in index.css (`--font-serif` / `--font-mono`).
 * These are the CSS font-family fallback stacks; on-device the RN app is
 * responsible for loading and linking the actual "Newsreader" and
 * "Geist Mono" font files (e.g. via `expo-font`) before referencing the
 * family names below. That font-loading wiring is not yet implemented —
 * see KNOWN-GAPS.md.
 */
export const tomatoFonts = {
  serif: 'Newsreader',
  serifFallback: 'Georgia, serif',
  mono: 'Geist Mono',
  monoFallback: 'monospace',
} as const;

export const tomatoTheme = {
  colors: tomatoColors,
  fonts: tomatoFonts,
} as const;

export type TomatoTheme = typeof tomatoTheme;
