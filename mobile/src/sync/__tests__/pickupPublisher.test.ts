import { publishPickup } from '../pickupPublisher';
import { createInMemorySyncTransport } from '../inMemorySyncTransport';
import { PhonePickupEvent } from '../SyncTransport';

describe('publishPickup', () => {
  it('publishes a phone_pickup event with a timestamp through the transport', async () => {
    const transport = createInMemorySyncTransport();
    const received: PhonePickupEvent[] = [];
    transport.subscribe((event) => received.push(event));

    const event = await publishPickup(transport, { now: () => 999 });

    expect(event).toEqual({ type: 'phone_pickup', ts: 999 });
    expect(received).toEqual([event]);
  });

  it('includes sessionId when provided', async () => {
    const transport = createInMemorySyncTransport();
    const received: PhonePickupEvent[] = [];
    transport.subscribe((event) => received.push(event));

    const event = await publishPickup(transport, { sessionId: 'session-1', now: () => 5 });

    expect(event).toEqual({ type: 'phone_pickup', sessionId: 'session-1', ts: 5 });
    expect(received).toEqual([event]);
  });

  it('omits sessionId entirely (not undefined) when not provided', async () => {
    const transport = createInMemorySyncTransport();
    const event = await publishPickup(transport, { now: () => 5 });

    expect('sessionId' in event).toBe(false);
  });

  it('defaults now to Date.now when not provided', async () => {
    const transport = createInMemorySyncTransport();
    const before = Date.now();
    const event = await publishPickup(transport);
    const after = Date.now();

    expect(event.ts).toBeGreaterThanOrEqual(before);
    expect(event.ts).toBeLessThanOrEqual(after);
  });
});
