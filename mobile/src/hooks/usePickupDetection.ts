/**
 * Thin RN hook wiring the device accelerometer to the pure `detectPickup`
 * heuristic. Deliberately dumb: it just buffers samples into a rolling
 * window and re-runs the pure function on every new sample, calling
 * `onPickup` on a rising edge (so a sustained "picked up" reading doesn't
 * fire repeatedly).
 *
 * All the actual detection LOGIC lives in `../pickup/pickupDetector.ts`,
 * which is unit-tested without any device/simulator dependency. This file
 * is intentionally thin and not unit-tested itself (it's just device I/O
 * plumbing) — see KNOWN-GAPS.md for what device/simulator verification is
 * still pending.
 */
import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

import {
  AccelerometerSample,
  detectPickup,
  DEFAULT_PICKUP_CONFIG,
  PickupDetectionConfig,
} from '../pickup/pickupDetector';
import { SyncTransport } from '../sync/SyncTransport';
import { publishPickup } from '../sync/pickupPublisher';

export interface UsePickupDetectionOptions {
  /** How often expo-sensors delivers a sample, in ms. Default: 100ms. */
  updateIntervalMs?: number;
  /** Number of most-recent samples kept in the rolling window. */
  windowSize?: number;
  /** Thresholds passed through to `detectPickup`. */
  config?: PickupDetectionConfig;
  /** Called once per rising edge into "picked up". */
  onPickup?: () => void;
  /**
   * If provided, a `phone_pickup` event is published through this transport
   * on the same rising edge as `onPickup` (see U03 SyncTransport). Omit to
   * keep pickup detection purely local, e.g. in tests/environments with no
   * transport configured.
   */
  syncTransport?: SyncTransport;
  /** Passed through to `publishPickup` as the active session, if known. */
  sessionId?: string;
}

export function usePickupDetection(options: UsePickupDetectionOptions = {}) {
  const {
    updateIntervalMs = 100,
    windowSize = 5,
    config = DEFAULT_PICKUP_CONFIG,
    onPickup,
    syncTransport,
    sessionId,
  } = options;

  const [pickedUp, setPickedUp] = useState(false);
  const windowRef = useRef<AccelerometerSample[]>([]);
  const wasPickedUpRef = useRef(false);

  useEffect(() => {
    Accelerometer.setUpdateInterval(updateIntervalMs);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const sample: AccelerometerSample = { x, y, z, timestamp: Date.now() };
      const nextWindow = [...windowRef.current, sample].slice(-windowSize);
      windowRef.current = nextWindow;

      const result = detectPickup(nextWindow, config);
      setPickedUp(result.pickedUp);

      if (result.pickedUp && !wasPickedUpRef.current) {
        onPickup?.();
        if (syncTransport) {
          publishPickup(syncTransport, { sessionId }).catch(() => {
            // Spike-scope: no retry/backoff. A dropped publish just means
            // the Electron side misses that one pickup event.
          });
        }
      }
      wasPickedUpRef.current = result.pickedUp;
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config/onPickup/syncTransport/sessionId identity churn is fine here
  }, [updateIntervalMs, windowSize]);

  return { pickedUp };
}
