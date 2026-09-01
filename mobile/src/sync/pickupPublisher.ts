/**
 * RN-side pickup publisher: turns a "pickup detected" moment into a
 * `PhonePickupEvent` and hands it to whatever `SyncTransport` is passed in
 * (dependency injection, so tests use a mock/in-memory transport, and a real
 * `CloudKitSyncTransport` can be swapped in later — see `SyncTransport.ts`).
 *
 * Deliberately tiny and side-effect-free apart from the `transport.publish`
 * call itself, so it's easy to unit-test without any RN/device APIs.
 */
import { PhonePickupEvent, SyncTransport } from './SyncTransport';

export interface PublishPickupOptions {
  /** The active focus session, if the RN app knows about one. Spike-scope: no session pairing exists yet, so this is usually undefined. */
  sessionId?: string;
  /** Injectable for tests; defaults to Date.now. */
  now?: () => number;
}

/** Publish a `phone_pickup` event through the given transport. */
export async function publishPickup(
  transport: SyncTransport,
  options: PublishPickupOptions = {}
): Promise<PhonePickupEvent> {
  const { sessionId, now = Date.now } = options;
  const event: PhonePickupEvent = {
    type: 'phone_pickup',
    ts: now(),
    ...(sessionId ? { sessionId } : {}),
  };
  await transport.publish(event);
  return event;
}
