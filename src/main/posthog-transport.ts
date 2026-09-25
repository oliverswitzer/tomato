import { PostHog } from 'posthog-node';
import type { AnalyticsTransport } from './analytics';

/**
 * Returns null when no project token is compiled in, which is the default in dev
 * and CI — callers treat that as "log locally, send nothing".
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
    // is real and useful. The IP itself is not stored as a property, and the privacy
    // page discloses this.
    disableGeoip: false,
  });

  return {
    capture: ({ distinctId, event, properties }) => {
      client.capture({ distinctId, event, properties });
    },
    shutdown: (timeoutMs: number) => client.shutdown(timeoutMs),
  };
}
