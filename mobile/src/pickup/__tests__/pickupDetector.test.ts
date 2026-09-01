import {
  detectPickup,
  DEFAULT_PICKUP_CONFIG,
  AccelerometerSample,
} from '../pickupDetector';

/** Build samples with a shared base timestamp step of 50ms. */
function series(vectors: Array<[number, number, number]>): AccelerometerSample[] {
  return vectors.map(([x, y, z], i) => ({ x, y, z, timestamp: i * 50 }));
}

describe('detectPickup', () => {
  it('does not flag a resting phone (flat on table, near-zero variance)', () => {
    const samples = series([
      [0.01, -0.02, 0.99],
      [0.0, -0.01, 1.0],
      [0.02, 0.0, 0.98],
      [0.0, -0.02, 1.0],
      [0.01, 0.0, 0.99],
    ]);

    const result = detectPickup(samples);

    expect(result.pickedUp).toBe(false);
  });

  it('flags a genuine pickup (flat -> tilted, with a motion spike)', () => {
    // Phone starts flat (z ~ 1), then a hand grabs it — the grab itself
    // adds linear acceleration on top of gravity (the jerk, magnitude
    // briefly exceeds 1g), then it settles tilted upright (z -> ~0.1, x
    // picks up the tilt).
    const samples = series([
      [0.0, 0.0, 1.0],
      [0.1, 0.2, 1.6],
      [0.3, 0.4, 0.6],
      [0.7, 0.5, 0.2],
      [0.75, 0.45, 0.1],
    ]);

    const result = detectPickup(samples);

    expect(result.pickedUp).toBe(true);
    expect(result.tiltDelta).toBeGreaterThanOrEqual(
      DEFAULT_PICKUP_CONFIG.tiltDeltaThreshold
    );
    expect(result.maxMotionDelta).toBeGreaterThanOrEqual(
      DEFAULT_PICKUP_CONFIG.motionDeltaThreshold
    );
  });

  it('does not flag jostling (bump-and-return, no sustained tilt)', () => {
    // Resting flat, gets bumped (magnitude spikes), but returns to the same
    // flat orientation by the end of the window — should NOT count as pickup.
    const samples = series([
      [0.0, 0.0, 1.0],
      [0.1, 0.3, 1.4],
      [-0.2, -0.1, 0.6],
      [0.05, 0.05, 1.05],
      [0.0, 0.0, 1.0],
    ]);

    const result = detectPickup(samples);

    expect(result.pickedUp).toBe(false);
    // Sanity check the heuristic actually saw the jostle motion, it just
    // correctly didn't call it a pickup because tilt reverted.
    expect(result.maxMotionDelta).toBeGreaterThanOrEqual(
      DEFAULT_PICKUP_CONFIG.motionDeltaThreshold
    );
  });

  it('does not flag a slow, tiny drift with no real motion', () => {
    const samples = series([
      [0.0, 0.0, 1.0],
      [0.02, 0.01, 0.99],
      [0.04, 0.02, 0.98],
      [0.06, 0.03, 0.97],
      [0.08, 0.04, 0.96],
    ]);

    const result = detectPickup(samples);

    expect(result.pickedUp).toBe(false);
  });

  it('returns not-picked-up when there are too few samples', () => {
    const samples = series([
      [0.0, 0.0, 1.0],
      [0.9, 0.9, 0.1],
    ]);

    const result = detectPickup(samples, {
      ...DEFAULT_PICKUP_CONFIG,
      minSamples: 3,
    });

    expect(result.pickedUp).toBe(false);
    expect(result.tiltDelta).toBe(0);
    expect(result.maxMotionDelta).toBe(0);
  });

  it('respects custom thresholds', () => {
    const samples = series([
      [0.0, 0.0, 1.0],
      [0.05, 0.0, 0.95],
      [0.1, 0.0, 0.9],
    ]);

    // With very low thresholds, even a small tilt/motion should register.
    const lenient = detectPickup(samples, {
      tiltDeltaThreshold: 0.05,
      motionDeltaThreshold: 0.01,
      minSamples: 3,
    });
    expect(lenient.pickedUp).toBe(true);

    // With the real default thresholds, this tiny drift should not.
    const strict = detectPickup(samples, DEFAULT_PICKUP_CONFIG);
    expect(strict.pickedUp).toBe(false);
  });
});
