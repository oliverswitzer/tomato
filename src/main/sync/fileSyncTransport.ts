/**
 * Electron-side mirror of `mobile/src/sync/fileSyncTransport.ts` — see that
 * file's header for the full rationale (proves cross-PROCESS event delivery
 * on a dev machine, standing in for real cross-device iCloud/CloudKit sync
 * until that can be provisioned; see KNOWN-GAPS.md at repo root).
 *
 * Kept as a near-identical port rather than a shared import for the same
 * reason as `PickupSyncTransport.ts`: `mobile/` and the root Electron app
 * are deliberately separate, undeclared-dependency packages.
 *
 * In this spike, the RN app and the Electron app are told to point at the
 * SAME file path (see `getDefaultPickupSyncFilePath` below) so that, on this
 * one dev machine, a script standing in for the phone and the real Electron
 * process can genuinely hand events to each other through it.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PhonePickupEvent, SyncTransport, Unsubscribe } from './PickupSyncTransport';

export interface FileSyncTransportOptions {
  /** Path to the shared event log file. Created if it doesn't exist. */
  filePath: string;
  /** How often subscribers poll the file for new lines, in ms. Default 50ms. */
  pollIntervalMs?: number;
}

export function createFileSyncTransport(options: FileSyncTransportOptions): SyncTransport {
  const { filePath, pollIntervalMs = 50 } = options;

  function ensureFile(): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
    }
  }

  return {
    async publish(event: PhonePickupEvent): Promise<void> {
      ensureFile();
      fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
    },
    subscribe(handler: (event: PhonePickupEvent) => void): Unsubscribe {
      ensureFile();
      let readOffset = fs.statSync(filePath).size;

      const timer = setInterval(() => {
        let size: number;
        try {
          size = fs.statSync(filePath).size;
        } catch {
          return;
        }
        if (size <= readOffset) {
          return;
        }

        const fd = fs.openSync(filePath, 'r');
        try {
          const length = size - readOffset;
          const buffer = Buffer.alloc(length);
          fs.readSync(fd, buffer, 0, length, readOffset);
          readOffset = size;

          const chunk = buffer.toString('utf8');
          const lines = chunk.split('\n').filter((line) => line.trim().length > 0);
          for (const line of lines) {
            try {
              const event = JSON.parse(line) as PhonePickupEvent;
              handler(event);
            } catch {
              // Ignore a partially-written line; it'll be re-read (from the
              // still-unmoved offset) once the writer finishes flushing it.
            }
          }
        } finally {
          fs.closeSync(fd);
        }
      }, pollIntervalMs);

      return () => {
        clearInterval(timer);
      };
    },
  };
}

/**
 * Default shared event-log path for this spike: a fixed file under the OS
 * temp dir that both a stand-in "phone" script and this Electron app point
 * at. NOT a production mechanism — see KNOWN-GAPS.md for what real
 * cross-device sync (CloudKit) requires instead.
 */
export function getDefaultPickupSyncFilePath(): string {
  return path.join(os.tmpdir(), 'tomato-pickup-sync.jsonl');
}
