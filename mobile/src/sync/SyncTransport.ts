/**
 * SyncTransport — the swappable interface between "phone pickup happened"
 * and "some other device/process finds out about it".
 *
 * Why this exists: real cross-device sync (RN phone -> Electron desktop app)
 * needs iCloud / CloudKit (NSUbiquitousKeyValueStore or a CloudKit record
 * zone), which requires an Apple Developer Program team, an iCloud container
 * provisioned in the Developer Portal, and signed entitlements — none of
 * which can be set up non-interactively in this spike environment (see
 * KNOWN-GAPS.md). So the transport is defined as an interface with mock
 * implementations behind it, and a real `CloudKitSyncTransport` can be
 * dropped in later without touching any caller.
 *
 * Two mock implementations exist (see `inMemorySyncTransport.ts` and
 * `fileSyncTransport.ts`):
 *   - InMemorySyncTransport: pure JS, no Node/device APIs. Safe to bundle
 *     into the actual RN app (Metro/Hermes has no `fs` polyfill, so this is
 *     what `App.tsx` uses for now) and to unit-test. It only delivers
 *     events within the same JS process, so it does NOT prove cross-process
 *     delivery by itself.
 *   - FileSyncTransport: Node `fs`-backed, so two separate Node processes on
 *     the SAME machine (e.g. a script standing in for the phone + the
 *     Electron receiver added in U04) can genuinely publish/subscribe to
 *     each other through a shared file. This is what proves the plumbing
 *     end-to-end on a dev machine without needing a device, and is reused by
 *     the Electron side in U04. It is Node-only and must never be imported
 *     from RN component code (Metro can't bundle Node core modules).
 */

/** The one event type this spike's sync layer carries. */
export interface PhonePickupEvent {
  type: 'phone_pickup';
  /** Optional: which focus session this pickup happened during, if known client-side. */
  sessionId?: string;
  /** ms since epoch. */
  ts: number;
}

/** Unsubscribe function returned by `subscribe`. */
export type Unsubscribe = () => void;

export interface SyncTransport {
  publish(event: PhonePickupEvent): Promise<void>;
  subscribe(handler: (event: PhonePickupEvent) => void): Unsubscribe;
}
