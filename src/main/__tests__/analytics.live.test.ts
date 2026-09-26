import { describe, it, expect } from 'vitest';
import { createAnalytics } from '../analytics';
import { createPostHogTransport } from '../posthog-transport';
import { anonymousDistinctId } from '../machine-id';
import { buildSessionEndedEvent } from '../../shared/analytics-events';
import { POSTHOG_PROJECT_TOKEN, POSTHOG_HOST } from '../../config/analytics';

// This suite talks to the real PostHog project, so it is opt-in:
//   npm run verify:analytics
// `npm test` and CI skip it entirely, but typecheck still covers it.
const LIVE = process.env.TOMATO_LIVE_ANALYTICS === '1';

// A throwaway identity. Derived from a timestamp rather than the real machine id so the
// check can never be mistaken for an install and never merges into anyone's person profile.
const CHECK_DISTINCT_ID = anonymousDistinctId(`relay-live-check-${Date.now()}`);

describe.skipIf(!LIVE)('live PostHog delivery', () => {
  it('serves the project config from the configured region, and not from the other one', async () => {
    const ours = await fetch(`${POSTHOG_HOST}/array/${POSTHOG_PROJECT_TOKEN}/config`);
    expect(ours.status).toBe(200);
    await expect(ours.json()).resolves.toMatchObject({ analytics: { endpoint: '/i/v0/e/' } });

    const otherRegion = POSTHOG_HOST.includes('us.i.')
      ? 'https://eu.i.posthog.com'
      : 'https://us.i.posthog.com';
    const theirs = await fetch(`${otherRegion}/array/${POSTHOG_PROJECT_TOKEN}/config`);
    expect(theirs.status).not.toBe(200);
  }, 30_000);

  it('answers 404 for a token that is not this project, so the check above is discriminating', async () => {
    // Without this, the 200 above could just mean "the host is up". Verified by hand:
    // the ingest endpoint is NOT usable for this — see the next test.
    const bogus = await fetch(
      `${POSTHOG_HOST}/array/phc_definitelyNotARealProjectTokenAtAll000000000000/config`,
    );
    expect(bogus.status).toBe(404);
  }, 30_000);

  it('accepts a capture posted to the project over the documented ingest endpoint', async () => {
    // A named diagnostic rather than a real funnel event, so the check cannot inflate
    // app_launched. docs/analytics-verification.md says to exclude it from funnels.
    //
    // NOTE: this proves the ingest endpoint accepts our request shape, NOT that the token
    // is valid — PostHog answers 200 {"status":"Ok"} even for a nonexistent project token
    // (verified by hand against this host). Token validity is proven by the /array/<token>/
    // config probes above, which 404 for a bogus token and for the wrong region.
    const res = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event: 'tomato_live_check',
        distinct_id: CHECK_DISTINCT_ID,
        properties: { environment: 'development' },
      }),
    });

    expect(res.status).toBe(200);
    // The plan predicted {"status":1}; the live endpoint actually answers {"status":"Ok"}.
    // Accept either so a future PostHog change back to the numeric form does not fail us.
    const body = (await res.json()) as { status?: unknown };
    expect(['Ok', 1]).toContain(body.status);
  }, 30_000);

  it('flushes every catalog event through the real posthog-node transport without error', async () => {
    const transport = createPostHogTransport(POSTHOG_PROJECT_TOKEN, POSTHOG_HOST);
    expect(transport).not.toBeNull();

    const lines: string[] = [];
    const analytics = createAnalytics({
      transport,
      distinctId: CHECK_DISTINCT_ID,
      enabled: true,
      environment: 'development',
      log: (msg) => {
        lines.push(msg);
      },
      shutdownTimeoutMs: 20_000,
    });

    analytics.capture({
      name: 'app_launched',
      properties: { app_version: '0.2.0', is_first_launch: true },
    });
    analytics.capture({
      name: 'onboarding_step_completed',
      properties: { step: 'screen_permission' },
    });
    analytics.capture({
      name: 'onboarding_step_completed',
      properties: { step: 'accessibility_permission' },
    });
    analytics.capture({ name: 'onboarding_step_completed', properties: { step: 'api_key' } });
    analytics.capture({ name: 'onboarding_completed', properties: { app_version: '0.2.0' } });
    analytics.capture({ name: 'session_started', properties: { planned_duration_min: 25 } });
    analytics.capture(
      buildSessionEndedEvent({
        plannedDurationMin: 25,
        startedAtMs: Date.now() - 30_000,
        endedAtMs: Date.now(),
        endReason: 'user_ended',
      }),
    );
    analytics.capture({ name: 'hud_toggled', properties: { expanded: true } });

    await analytics.shutdown();

    expect(lines.filter((l) => l.includes('capture failed'))).toEqual([]);
    expect(lines.filter((l) => l.includes('shutdown failed'))).toEqual([]);
    expect(lines).toHaveLength(8);
    for (const line of lines) {
      expect(line).toContain('"environment":"development"');
    }

    console.log(`[live-check] look for distinct_id ${CHECK_DISTINCT_ID} in PostHog`);
  }, 60_000);

  it('still sends nothing when the token is blanked, which is how the inert path stays provable', () => {
    expect(createPostHogTransport('', POSTHOG_HOST)).toBeNull();
  });
});
