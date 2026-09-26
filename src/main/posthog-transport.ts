import { PostHog } from 'posthog-node';
import type { AnalyticsTransport } from './analytics';

/**
 * Returns null when the token is empty — callers treat that as "log locally, send
 * nothing". A live token is compiled in (src/config/analytics.ts), so this is the
 * opt-out path (`TOMATO_POSTHOG_TOKEN=`), not the default.
 */
export function createPostHogTransport(token: string, host: string): AnalyticsTransport | null {
  if (!token) return null;

  const client = new PostHog(token, {
    host,
    // Desktop app, not a server: events are low-volume and we want them promptly.
    flushAt: 1,
    flushInterval: 10_000,
    // posthog-node suppresses GeoIP by default because server-side the request IP
    // is the server's. Here the client IS the user's machine, so approximate country
    // is real and useful. Note that PostHog also retains the request IP alongside the
    // event under default project settings (dropping it requires the project's
    // "Discard client IP data" toggle, which no code here can set) — privacy.html
    // discloses both the country derivation and that retention.
    disableGeoip: false,
  });

  return {
    capture: ({ distinctId, event, properties }) => {
      client.capture({ distinctId, event, properties });
    },
    shutdown: (timeoutMs: number) => client.shutdown(timeoutMs),
  };
}
