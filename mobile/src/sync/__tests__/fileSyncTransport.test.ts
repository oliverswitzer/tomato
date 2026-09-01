import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createFileSyncTransport } from '../fileSyncTransport';
import { PhonePickupEvent } from '../SyncTransport';

function tmpFilePath(): string {
  return path.join(os.tmpdir(), `sync-transport-test-${Date.now()}-${Math.random()}.jsonl`);
}

function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

describe('FileSyncTransport', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpFilePath();
  });

  afterEach(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it('delivers an event published from one transport instance to a subscriber on another (cross-process stand-in)', async () => {
    // Two SEPARATE transport instances pointed at the same file — this is
    // what stands in for "phone process" and "Electron process" in this
    // spike (see fileSyncTransport.ts header comment).
    const publisherSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });
    const receiverSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });

    const received: PhonePickupEvent[] = [];
    const unsubscribe = receiverSide.subscribe((event) => received.push(event));

    const event: PhonePickupEvent = { type: 'phone_pickup', sessionId: 'abc', ts: 42 };
    await publisherSide.publish(event);

    await waitFor(() => received.length === 1);
    expect(received[0]).toEqual(event);

    unsubscribe();
  });

  it('delivers multiple events in order', async () => {
    const publisherSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });
    const receiverSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });

    const received: PhonePickupEvent[] = [];
    const unsubscribe = receiverSide.subscribe((event) => received.push(event));

    await publisherSide.publish({ type: 'phone_pickup', ts: 1 });
    await publisherSide.publish({ type: 'phone_pickup', ts: 2 });
    await publisherSide.publish({ type: 'phone_pickup', ts: 3 });

    await waitFor(() => received.length === 3);
    expect(received.map((e) => e.ts)).toEqual([1, 2, 3]);

    unsubscribe();
  });

  it('does not redeliver events already read once a subscriber joined', async () => {
    const publisherSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });
    await publisherSide.publish({ type: 'phone_pickup', ts: 1 });

    // Subscriber joins AFTER the first event was written; it should only
    // pick up new events from its own join point onward, not the backlog.
    const receiverSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });
    const received: PhonePickupEvent[] = [];
    const unsubscribe = receiverSide.subscribe((event) => received.push(event));

    await publisherSide.publish({ type: 'phone_pickup', ts: 2 });
    await waitFor(() => received.length === 1);

    expect(received).toEqual([{ type: 'phone_pickup', ts: 2 }]);

    unsubscribe();
  });

  it('stops delivering after unsubscribe', async () => {
    const publisherSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });
    const receiverSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });

    const received: PhonePickupEvent[] = [];
    const unsubscribe = receiverSide.subscribe((event) => received.push(event));
    unsubscribe();

    await publisherSide.publish({ type: 'phone_pickup', ts: 1 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toHaveLength(0);
  });
});
