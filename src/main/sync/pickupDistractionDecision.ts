/**
 * Pure decision logic: "given a phone_pickup event and the current session
 * state, should this raise the possible-distraction UI?" — kept separate
 * from any wiring/IPC/window code so it's fully unit-testable without an
 * Electron runtime.
 *
 * Reuses the SAME shape the LLM-driven drift path uses (see
 * `focus-tracker.ts` `onDrift` and `sessionStore.ts` `DriftInfo`) so the
 * renderer doesn't need a second, pickup-specific UI: a pickup gets
 * surfaced through the identical `drift-detected` IPC event / `driftInfo`
 * store field, just with a `level2Classification` that names it as a
 * phone-pickup so downstream code (and the user) can tell drift reasons
 * apart later if they want to.
 */

export interface DriftInfo {
  reason: string;
  confidence: number;
  level2Classification: string;
}

export interface PhonePickupEventLike {
  type: 'phone_pickup';
  sessionId?: string;
  ts: number;
}

export interface PickupDistractionDecisionInput {
  event: PhonePickupEventLike;
  /** Whether a Tomato focus session is currently active (not paused-out, not ended). */
  sessionActive: boolean;
  /** Whether the active session is currently paused (a pickup during a pause is expected, not a distraction). */
  sessionPaused: boolean;
}

/**
 * Fixed confidence assigned to phone-pickup-triggered drift. Deliberately
 * above the 0.6 threshold `focus-tracker.ts` uses for LLM-driven drift so a
 * pickup always surfaces the possible-distraction UI when it fires.
 */
export const PICKUP_DRIFT_CONFIDENCE = 0.75;

export const PICKUP_LEVEL2_CLASSIFICATION = 'Phone pickup';

/**
 * Decide whether a phone-pickup event should raise the possible-distraction
 * UI right now, and if so, with what `DriftInfo` payload. Returns `null`
 * when it shouldn't (no active session, or session is paused).
 */
export function decidePickupDistraction(
  input: PickupDistractionDecisionInput
): DriftInfo | null {
  const { sessionActive, sessionPaused } = input;

  if (!sessionActive || sessionPaused) {
    return null;
  }

  return {
    reason: 'Phone picked up during an active focus session.',
    confidence: PICKUP_DRIFT_CONFIDENCE,
    level2Classification: PICKUP_LEVEL2_CLASSIFICATION,
  };
}
