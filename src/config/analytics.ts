// PostHog project token. A project token is a PUBLIC, write-only key — safe to ship
// in a client. It is compiled in here rather than read from process.env because a
// packaged macOS app launched from Finder does not inherit shell environment
// variables (see CLAUDE.md). This is unlike ANTHROPIC_API_KEY, which is secret and
// must stay out of the bundle.
//
// `splash/index.html` carries this same token for the web half of the funnel;
// src/config/__tests__/analytics.test.ts fails if the two ever drift apart.
//
// To silence sending during a dev run without editing this file, export an empty
// TOMATO_POSTHOG_TOKEN (see src/main/main.ts) — the app then only writes
// [analytics] lines to tomato.log.
export const POSTHOG_PROJECT_TOKEN = 'phc_tVk47syJwzBZXn6fVGMWh9f9ZeX7utiPFuHrPofoPrtA';

// Must match the project's region. Verified: GET <host>/array/<token>/config returns
// 200 on the US host and 404 on the EU one — asserted by
// src/main/__tests__/analytics.live.test.ts.
export const POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * Safe to print to a log or paste into an issue: enough to tell two tokens apart,
 * not enough to write events into someone's project.
 */
export function maskToken(token: string): string {
  if (!token) return '(none)';
  if (token.length <= 10) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}
