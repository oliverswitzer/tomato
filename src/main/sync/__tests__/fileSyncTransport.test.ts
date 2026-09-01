import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFileSyncTransport, getDefaultPickupSyncFilePath } from '../fileSyncTransport';
import { PhonePickupEvent } from '../PickupSyncTransport';

function tmpFilePath(): string {
  return path.join(os.tmpdir(), `tomato-electron-sync-test-${Date.now()}-${Math.random()}.jsonl`);
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

describe('Electron-side FileSyncTransport (mirrors mobile/src/sync/fileSyncTransport.ts)', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpFilePath();
  });

  afterEach(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it('delivers an event published from one instance to a subscriber on another (stand-in for phone -> Electron)', async () => {
    const phoneSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });
    const electronSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });

    const received: PhonePickupEvent[] = [];
    const unsubscribe = electronSide.subscribe((event) => received.push(event));

    const event: PhonePickupEvent = { type: 'phone_pickup', sessionId: 'session-1', ts: 42 };
    await phoneSide.publish(event);

    await waitFor(() => received.length === 1);
    expect(received[0]).toEqual(event);

    unsubscribe();
  });

  it('delivers multiple events in order across the process-boundary stand-in', async () => {
    const phoneSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });
    const electronSide = createFileSyncTransport({ filePath, pollIntervalMs: 10 });

    const received: PhonePickupEvent[] = [];
    const unsubscribe = electronSide.subscribe((event) => received.push(event));

    await phoneSide.publish({ type: 'phone_pickup', ts: 1 });
    await phoneSide.publish({ type: 'phone_pickup', ts: 2 });
    await phoneSide.publish({ type: 'phone_pickup', ts: 3 });

    await waitFor(() => received.length === 3);
    expect(received.map((e) => e.ts)).toEqual([1, 2, 3]);

    unsubscribe();
  });

  it('getDefaultPickupSyncFilePath returns a stable path under the OS temp dir', () => {
    const p1 = getDefaultPickupSyncFilePath();
    const p2 = getDefaultPickupSyncFilePath();
    expect(p1).toEqual(p2);
    expect(p1.startsWith(os.tmpdir())).toBe(true);
    expect(p1.endsWith('tomato-pickup-sync.jsonl')).toBe(true);
  });
});
