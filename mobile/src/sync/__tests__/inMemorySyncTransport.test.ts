import { createInMemorySyncTransport } from '../inMemorySyncTransport';
import { PhonePickupEvent } from '../SyncTransport';

describe('InMemorySyncTransport', () => {
  it('delivers a published event to a subscriber', async () => {
    const transport = createInMemorySyncTransport();
    const received: PhonePickupEvent[] = [];
    transport.subscribe((event) => received.push(event));

    const event: PhonePickupEvent = { type: 'phone_pickup', ts: 123 };
    await transport.publish(event);

    expect(received).toEqual([event]);
  });

  it('delivers to multiple subscribers', async () => {
    const transport = createInMemorySyncTransport();
    const a: PhonePickupEvent[] = [];
    const b: PhonePickupEvent[] = [];
    transport.subscribe((event) => a.push(event));
    transport.subscribe((event) => b.push(event));

    await transport.publish({ type: 'phone_pickup', ts: 1 });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('stops delivering after unsubscribe', async () => {
    const transport = createInMemorySyncTransport();
    const received: PhonePickupEvent[] = [];
    const unsubscribe = transport.subscribe((event) => received.push(event));

    unsubscribe();
    await transport.publish({ type: 'phone_pickup', ts: 1 });

    expect(received).toHaveLength(0);
  });

  it('does not deliver events published before a subscriber joins', async () => {
    const transport = createInMemorySyncTransport();
    await transport.publish({ type: 'phone_pickup', ts: 1 });

    const received: PhonePickupEvent[] = [];
    transport.subscribe((event) => received.push(event));

    expect(received).toHaveLength(0);
  });
});
