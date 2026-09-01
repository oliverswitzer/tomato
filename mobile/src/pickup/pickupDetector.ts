/**
 * Pure phone-pickup detection heuristic.
 *
 * Given a short rolling window of accelerometer samples (gravity-inclusive,
 * `expo-sensors` `Accelerometer` units — each axis in "g", i.e. 1.0 == 9.8
 * m/s^2 at rest), decide whether the phone was just picked up.
 *
 * Heuristic (deliberately simple for a spike, tuned by hand against the
 * fabricated series in the accompanying test file — not device-calibrated):
 *
 * 1. RESTING BASELINE: a phone lying flat on a table reads close to
 *    `z ~= 1` (or `-1` face down) with very little magnitude variance and
 *    negligible x/y tilt.
 * 2. PICKUP shows up as BOTH:
 *      a) a tilt/orientation change — the resting axis (whichever of x/y/z
 *         had the largest magnitude at the start of the window) shifts by
 *         more than `tiltDeltaThreshold` in magnitude, AND
 *      b) a motion delta — the sample-to-sample jerk (derivative of the
 *         magnitude of the acceleration vector) exceeds `motionDeltaThreshold`
 *         at least once in the window.
 * 3. JOSTLING (phone resting on a surface that gets bumped) tends to produce
 *    (b) without a sustained (a) — the vector magnitude spikes briefly but
 *    the resting-axis orientation snaps back. We require the tilt delta to
 *    be measured between the FIRST and LAST sample of the window (a
 *    sustained change), not just a peak-to-peak swing, so a bump-and-return
 *    does not qualify.
 *
 * This is intentionally a pure function with no RN/device dependency so it
 * can be unit-tested without a simulator (none is available in this spike
 * environment — see KNOWN-GAPS.md).
 */

export interface AccelerometerSample {
  x: number;
  y: number;
  z: number;
  /** ms timestamp, only used for ordering; not required to be evenly spaced. */
  timestamp: number;
}

export interface PickupDetectionConfig {
  /** Minimum change in the dominant resting axis (first vs last sample), in g. */
  tiltDeltaThreshold: number;
  /** Minimum sample-to-sample jump in vector magnitude (jerk), in g. */
  motionDeltaThreshold: number;
  /** Need at least this many samples to make a decision. */
  minSamples: number;
}

export const DEFAULT_PICKUP_CONFIG: PickupDetectionConfig = {
  tiltDeltaThreshold: 0.4,
  motionDeltaThreshold: 0.3,
  minSamples: 3,
};

export interface PickupDetectionResult {
  pickedUp: boolean;
  /** Diagnostics, useful for tuning/debugging; not required by callers. */
  tiltDelta: number;
  maxMotionDelta: number;
}

function magnitude(s: AccelerometerSample): number {
  return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
}

/** Axis with the largest absolute value in the first sample — the "resting axis". */
function dominantAxis(sample: AccelerometerSample): 'x' | 'y' | 'z' {
  const { x, y, z } = sample;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (ax >= ay && ax >= az) return 'x';
  if (ay >= ax && ay >= az) return 'y';
  return 'z';
}

/**
 * Decide whether a window of accelerometer samples represents a phone
 * pickup. `samples` must be in chronological order (oldest first).
 */
export function detectPickup(
  samples: AccelerometerSample[],
  config: PickupDetectionConfig = DEFAULT_PICKUP_CONFIG
): PickupDetectionResult {
  if (samples.length < config.minSamples) {
    return { pickedUp: false, tiltDelta: 0, maxMotionDelta: 0 };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const axis = dominantAxis(first);
  const tiltDelta = Math.abs(last[axis] - first[axis]);

  let maxMotionDelta = 0;
  for (let i = 1; i < samples.length; i++) {
    const delta = Math.abs(magnitude(samples[i]) - magnitude(samples[i - 1]));
    if (delta > maxMotionDelta) {
      maxMotionDelta = delta;
    }
  }

  const pickedUp =
    tiltDelta >= config.tiltDeltaThreshold &&
    maxMotionDelta >= config.motionDeltaThreshold;

  return { pickedUp, tiltDelta, maxMotionDelta };
}
