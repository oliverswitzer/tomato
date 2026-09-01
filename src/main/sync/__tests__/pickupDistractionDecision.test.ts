import { describe, it, expect } from 'vitest';
import {
  decidePickupDistraction,
  PICKUP_DRIFT_CONFIDENCE,
  PICKUP_LEVEL2_CLASSIFICATION,
} from '../pickupDistractionDecision';

const event = { type: 'phone_pickup' as const, ts: 1000 };

describe('decidePickupDistraction', () => {
  it('raises possible-distraction when a session is active and not paused', () => {
    const result = decidePickupDistraction({ event, sessionActive: true, sessionPaused: false });
    expect(result).toEqual({
      reason: 'Phone picked up during an active focus session.',
      confidence: PICKUP_DRIFT_CONFIDENCE,
      level2Classification: PICKUP_LEVEL2_CLASSIFICATION,
    });
  });

  it('does nothing when no session is active', () => {
    const result = decidePickupDistraction({ event, sessionActive: false, sessionPaused: false });
    expect(result).toBeNull();
  });

  it('does nothing when the active session is paused', () => {
    const result = decidePickupDistraction({ event, sessionActive: true, sessionPaused: true });
    expect(result).toBeNull();
  });

  it('does nothing when there is neither an active nor unpaused session', () => {
    const result = decidePickupDistraction({ event, sessionActive: false, sessionPaused: true });
    expect(result).toBeNull();
  });

  it('assigns a confidence at/above the 0.6 threshold focus-tracker.ts uses for LLM-driven drift', () => {
    expect(PICKUP_DRIFT_CONFIDENCE).toBeGreaterThanOrEqual(0.6);
  });

  it('carries the sessionId through only insofar as the decision is independent of it (spike scope: no session pairing yet)', () => {
    const withSession = decidePickupDistraction({
      event: { ...event, sessionId: 'abc' },
      sessionActive: true,
      sessionPaused: false,
    });
    const withoutSession = decidePickupDistraction({ event, sessionActive: true, sessionPaused: false });
    expect(withSession).toEqual(withoutSession);
  });
});
