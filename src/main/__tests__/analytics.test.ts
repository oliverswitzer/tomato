import { describe, it, expect } from 'vitest';
import { createAnalytics, type AnalyticsTransport, type CapturePayload } from '../analytics';
import { anonymousDistinctId } from '../machine-id';
import { buildSessionEndedEvent } from '../../shared/analytics-events';

function fakeTransport(opts: { throwOnCapture?: boolean; hangOnShutdown?: boolean } = {}) {
  const sent: CapturePayload[] = [];
  const transport: AnalyticsTransport = {
    capture(payload) {
      if (opts.throwOnCapture) throw new Error('network is down');
      sent.push(payload);
    },
    shutdown() {
      if (opts.hangOnShutdown) return new Promise<void>(() => {});
      return Promise.resolve();
    },
  };
  return { transport, sent };
}

function makeLogger() {
  const lines: string[] = [];
  return { lines, log: (msg: string) => { lines.push(msg); } };
}

describe('createAnalytics', () => {
  it('forwards a captured event to the transport with the distinct id', () => {
    const { transport, sent } = fakeTransport();
    const { log } = makeLogger();
    const analytics = createAnalytics({ transport, distinctId: 'abc123', enabled: true, log });

    analytics.capture({ name: 'session_started', properties: { planned_duration_min: 25 } });

    expect(sent).toEqual([
      { distinctId: 'abc123', event: 'session_started', properties: { planned_duration_min: 25 } },
    ]);
  });

  it('logs every captured event as "[analytics] <name> <props-json>"', () => {
    const { transport } = fakeTransport();
    const { lines, log } = makeLogger();
    const analytics = createAnalytics({ transport, distinctId: 'abc123', enabled: true, log });

    analytics.capture({ name: 'hud_toggled', properties: { expanded: true } });

    expect(lines).toEqual(['[analytics] hud_toggled {"expanded":true}']);
  });

  it('still logs but sends nothing when no transport is configured', () => {
    const { lines, log } = makeLogger();
    const analytics = createAnalytics({ transport: null, distinctId: 'abc123', enabled: true, log });

    analytics.capture({ name: 'session_started', properties: { planned_duration_min: 25 } });

    expect(lines).toEqual(['[analytics] session_started {"planned_duration_min":25}']);
  });

  it('emits nothing at all — not even a log line — when disabled', () => {
    const { transport, sent } = fakeTransport();
    const { lines, log } = makeLogger();
    const analytics = createAnalytics({ transport, distinctId: 'abc123', enabled: false, log });

    analytics.capture({ name: 'session_started', properties: { planned_duration_min: 25 } });

    expect(sent).toEqual([]);
    expect(lines).toEqual([]);
    expect(analytics.isEnabled()).toBe(false);
  });

  it('setEnabled takes effect immediately, both ways', () => {
    const { transport, sent } = fakeTransport();
    const { log } = makeLogger();
    const analytics = createAnalytics({ transport, distinctId: 'abc123', enabled: true, log });

    analytics.setEnabled(false);
    analytics.capture({ name: 'session_started', properties: { planned_duration_min: 25 } });
    expect(sent).toEqual([]);

    analytics.setEnabled(true);
    expect(analytics.isEnabled()).toBe(true);
    analytics.capture({ name: 'session_started', properties: { planned_duration_min: 50 } });
    expect(sent).toHaveLength(1);
    expect(sent[0].properties).toEqual({ planned_duration_min: 50 });
  });

  it('swallows a throwing transport instead of propagating', () => {
    const { transport } = fakeTransport({ throwOnCapture: true });
    const { lines, log } = makeLogger();
    const analytics = createAnalytics({ transport, distinctId: 'abc123', enabled: true, log });

    expect(() =>
      analytics.capture({ name: 'session_started', properties: { planned_duration_min: 25 } }),
    ).not.toThrow();
    expect(lines.some((l) => l.includes('capture failed'))).toBe(true);
  });

  it('shutdown resolves even when the transport never settles', async () => {
    const { transport } = fakeTransport({ hangOnShutdown: true });
    const { log } = makeLogger();
    const analytics = createAnalytics({
      transport,
      distinctId: 'abc123',
      enabled: true,
      log,
      shutdownTimeoutMs: 10,
    });

    await expect(analytics.shutdown()).resolves.toBeUndefined();
  });

  it('shutdown is a no-op with no transport', async () => {
    const { log } = makeLogger();
    const analytics = createAnalytics({ transport: null, distinctId: 'abc123', enabled: true, log });
    await expect(analytics.shutdown()).resolves.toBeUndefined();
  });

  it('never carries the intention text or the API key in any payload', () => {
    const { transport, sent } = fakeTransport();
    const { lines, log } = makeLogger();
    const analytics = createAnalytics({ transport, distinctId: 'abc123', enabled: true, log });

    analytics.capture({ name: 'app_launched', properties: { app_version: '0.2.0', is_first_launch: true } });
    analytics.capture({ name: 'onboarding_step_completed', properties: { step: 'api_key' } });
    analytics.capture({ name: 'onboarding_completed', properties: { app_version: '0.2.0' } });
    analytics.capture({ name: 'session_started', properties: { planned_duration_min: 25 } });
    analytics.capture(
      buildSessionEndedEvent({
        plannedDurationMin: 25,
        startedAtMs: 0,
        endedAtMs: 30_000,
        endReason: 'user_ended',
      }),
    );
    analytics.capture({ name: 'hud_toggled', properties: { expanded: false } });

    const everything = JSON.stringify(sent) + lines.join('\n');
    expect(everything).not.toContain('sk-ant');
    expect(everything).not.toContain('my secret project plan');
    expect(everything.toLowerCase()).not.toContain('intention');
    expect(sent).toHaveLength(6);
  });
});

describe('buildSessionEndedEvent', () => {
  it('marks a user-stopped short session as ended early', () => {
    const event = buildSessionEndedEvent({
      plannedDurationMin: 25,
      startedAtMs: 1_000_000,
      endedAtMs: 1_030_000,
      endReason: 'user_ended',
    });

    expect(event).toEqual({
      name: 'session_ended',
      properties: {
        planned_duration_min: 25,
        actual_duration_sec: 30,
        ended_early: true,
        end_reason: 'user_ended',
      },
    });
  });

  it('does not mark a run-to-completion session as ended early', () => {
    const event = buildSessionEndedEvent({
      plannedDurationMin: 25,
      startedAtMs: 0,
      endedAtMs: 25 * 60 * 1000,
      endReason: 'completed',
    });

    expect(event.properties.ended_early).toBe(false);
    expect(event.properties.actual_duration_sec).toBe(1500);
  });

  it('does not mark a completed session as early even if the clock drifts short', () => {
    const event = buildSessionEndedEvent({
      plannedDurationMin: 25,
      startedAtMs: 0,
      endedAtMs: 25 * 60 * 1000 - 400,
      endReason: 'completed',
    });

    expect(event.properties.ended_early).toBe(false);
  });

  it('does not mark a user-stopped full-length session as early', () => {
    const event = buildSessionEndedEvent({
      plannedDurationMin: 5,
      startedAtMs: 0,
      endedAtMs: 6 * 60 * 1000,
      endReason: 'user_ended',
    });

    expect(event.properties.ended_early).toBe(false);
  });

  it('records app_quit as an early end', () => {
    const event = buildSessionEndedEvent({
      plannedDurationMin: 25,
      startedAtMs: 0,
      endedAtMs: 60_000,
      endReason: 'app_quit',
    });

    expect(event.properties.end_reason).toBe('app_quit');
    expect(event.properties.ended_early).toBe(true);
  });
});

describe('anonymousDistinctId', () => {
  const RAW_UUID = '5FB1C2E4-9A3D-4E7B-8C21-0D9F6A4B7E33';

  it('is 32 lowercase hex characters', () => {
    expect(anonymousDistinctId(RAW_UUID)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable across calls', () => {
    expect(anonymousDistinctId(RAW_UUID)).toBe(anonymousDistinctId(RAW_UUID));
  });

  it('is not the raw machine UUID', () => {
    const id = anonymousDistinctId(RAW_UUID);
    expect(id).not.toBe(RAW_UUID);
    expect(id).not.toContain(RAW_UUID.toLowerCase());
    expect(RAW_UUID.toLowerCase()).not.toContain(id);
  });

  it('differs for a different machine', () => {
    expect(anonymousDistinctId(RAW_UUID)).not.toBe(anonymousDistinctId('some-other-machine'));
  });
});
