/**
 * File-backed mock SyncTransport (Node `fs` only — never import this from RN
 * component code; Metro/Hermes has no Node core module polyfills).
 *
 * Purpose: prove pickup-event delivery across a PROCESS boundary on a dev
 * machine, standing in for the real cross-device path until iCloud/CloudKit
 * can be provisioned (see KNOWN-GAPS.md). Two independent Node processes
 * (e.g. a script simulating the phone publisher, and the Electron receiver
 * added in U04) pointed at the same file genuinely exchange events through
 * it — unlike `InMemorySyncTransport`, which only works within one process.
 *
 * Implementation: publishing appends a JSON line to the file. Subscribing
 * polls the file's size at an interval and re-reads/parses any new lines
 * that appeared since the last read, delivering each one to every handler.
 * This is intentionally simple (no fs.watch, no locking) — good enough for
 * a spike's single-writer/single-reader-per-process use, not a production
 * IPC mechanism.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PhonePickupEvent, SyncTransport, Unsubscribe } from './SyncTransport';

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
