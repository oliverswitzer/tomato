import { describe, it, expect, vi } from 'vitest';
import { PickupDistractionReceiver } from '../PickupDistractionReceiver';
import { SyncTransport, PhonePickupEvent, Unsubscribe } from '../PickupSyncTransport';
import { PICKUP_DRIFT_CONFIDENCE, PICKUP_LEVEL2_CLASSIFICATION } from '../pickupDistractionDecision';

/** Minimal in-process fake transport — subscribe captures the handler, publish invokes it directly. Enough to test the receiver's wiring without pulling in the real (fs-based) FileSyncTransport. */
function fakeTransport(): { transport: SyncTransport; emit: (e: PhonePickupEvent) => void; subscriberCount: () => number } {
  const handlers = new Set<(e: PhonePickupEvent) => void>();
  return {
    transport: {
      async publish(event) {
        handlers.forEach((h) => h(event));
      },
      subscribe(handler): Unsubscribe {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    },
    emit: (e) => handlers.forEach((h) => h(e)),
    subscriberCount: () => handlers.size,
  };
}

describe('PickupDistractionReceiver', () => {
  it('fires onDistraction when a pickup arrives during an active, unpaused session', () => {
    const { transport, emit } = fakeTransport();
    const onDistraction = vi.fn();
    const receiver = new PickupDistractionReceiver({
      transport,
      getSessionInfo: () => ({ active: true, paused: false }),
      onDistraction,
    });

    receiver.start();
    emit({ type: 'phone_pickup', ts: 1 });

    expect(onDistraction).toHaveBeenCalledTimes(1);
    expect(onDistraction).toHaveBeenCalledWith({
      reason: 'Phone picked up during an active focus session.',
      confidence: PICKUP_DRIFT_CONFIDENCE,
      level2Classification: PICKUP_LEVEL2_CLASSIFICATION,
    });
  });

  it('does not fire when there is no active session', () => {
    const { transport, emit } = fakeTransport();
    const onDistraction = vi.fn();
    const receiver = new PickupDistractionReceiver({
      transport,
      getSessionInfo: () => ({ active: false, paused: false }),
      onDistraction,
    });

    receiver.start();
    emit({ type: 'phone_pickup', ts: 1 });

    expect(onDistraction).not.toHaveBeenCalled();
  });

  it('does not fire when the session is paused', () => {
    const { transport, emit } = fakeTransport();
    const onDistraction = vi.fn();
    const receiver = new PickupDistractionReceiver({
      transport,
      getSessionInfo: () => ({ active: true, paused: true }),
      onDistraction,
    });

    receiver.start();
    emit({ type: 'phone_pickup', ts: 1 });

    expect(onDistraction).not.toHaveBeenCalled();
  });

  it('re-evaluates session state on EACH pickup, not just at start time', () => {
    const { transport, emit } = fakeTransport();
    const onDistraction = vi.fn();
    let active = false;
    const receiver = new PickupDistractionReceiver({
      transport,
      getSessionInfo: () => ({ active, paused: false }),
      onDistraction,
    });

    receiver.start();
    emit({ type: 'phone_pickup', ts: 1 }); // no session yet
    expect(onDistraction).not.toHaveBeenCalled();

    active = true;
    emit({ type: 'phone_pickup', ts: 2 }); // session now active
    expect(onDistraction).toHaveBeenCalledTimes(1);
  });

  it('stop() unsubscribes so subsequent pickups are ignored', () => {
    const { transport, emit, subscriberCount } = fakeTransport();
    const onDistraction = vi.fn();
    const receiver = new PickupDistractionReceiver({
      transport,
      getSessionInfo: () => ({ active: true, paused: false }),
      onDistraction,
    });

    receiver.start();
    expect(receiver.listening).toBe(true);
    expect(subscriberCount()).toBe(1);

    receiver.stop();
    expect(receiver.listening).toBe(false);
    expect(subscriberCount()).toBe(0);

    emit({ type: 'phone_pickup', ts: 1 });
    expect(onDistraction).not.toHaveBeenCalled();
  });

  it('start() is idempotent — calling it twice does not double-subscribe', () => {
    const { transport, emit, subscriberCount } = fakeTransport();
    const onDistraction = vi.fn();
    const receiver = new PickupDistractionReceiver({
      transport,
      getSessionInfo: () => ({ active: true, paused: false }),
      onDistraction,
    });

    receiver.start();
    receiver.start();
    expect(subscriberCount()).toBe(1);

    emit({ type: 'phone_pickup', ts: 1 });
    expect(onDistraction).toHaveBeenCalledTimes(1);
  });

  it('ignores non-pickup events defensively (handleEvent guards on type)', () => {
    const { transport } = fakeTransport();
    const onDistraction = vi.fn();
    const receiver = new PickupDistractionReceiver({
      transport,
      getSessionInfo: () => ({ active: true, paused: false }),
      onDistraction,
    });

    // @ts-expect-error deliberately wrong event shape to prove the guard
    receiver.handleEvent({ type: 'not_a_pickup', ts: 1 });
    expect(onDistraction).not.toHaveBeenCalled();
  });
});
