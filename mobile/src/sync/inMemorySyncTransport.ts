/**
 * In-process mock SyncTransport. Pure JS (no Node core modules, no device
 * APIs) so it's safe to bundle into the actual RN app via Metro/Hermes.
 *
 * Limitation (documented, not hidden): this only delivers events to
 * subscribers within the SAME JS process/instance. It does NOT cross a
 * process or device boundary, so it cannot by itself prove "phone -> Electron
 * app" delivery — that's what `FileSyncTransport` is for (see
 * `fileSyncTransport.ts` and KNOWN-GAPS.md). Its job here is just to give
 * the RN app a working, testable transport to publish through today, with a
 * real `CloudKitSyncTransport` swappable in later behind the same interface.
 */
import { PhonePickupEvent, SyncTransport, Unsubscribe } from './SyncTransport';

export function createInMemorySyncTransport(): SyncTransport {
  const handlers = new Set<(event: PhonePickupEvent) => void>();

  return {
    async publish(event: PhonePickupEvent): Promise<void> {
      for (const handler of handlers) {
        handler(event);
      }
    },
    subscribe(handler: (event: PhonePickupEvent) => void): Unsubscribe {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
