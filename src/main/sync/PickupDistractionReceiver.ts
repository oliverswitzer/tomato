/**
 * Wires a `SyncTransport` subscription to the pure
 * `decidePickupDistraction` decision, and fires a callback with the
 * resulting `DriftInfo` when a pickup should surface the possible-distraction
 * UI. This is the U04 "receiver" — the RN app (or, in this spike, a
 * stand-in script) publishes `phone_pickup` events through the same
 * `FileSyncTransport` file, and this class is what `main.ts` starts
 * listening on for the duration of a session.
 *
 * Deliberately thin: all the actual "should this count as distraction?"
 * logic lives in the pure, independently-tested `pickupDistractionDecision.ts`.
 * This class's only job is plumbing — subscribe, look up current session
 * state via the injected `getSessionInfo`, call the pure function, forward
 * the result.
 */
import { SyncTransport, PhonePickupEvent, Unsubscribe } from './PickupSyncTransport';
import { decidePickupDistraction, DriftInfo } from './pickupDistractionDecision';

export interface SessionInfo {
  active: boolean;
  paused: boolean;
}

export interface PickupReceiverDeps {
  transport: SyncTransport;
  /** Reads current session state at the moment a pickup event arrives (call-by-reference to whatever main.ts's live sessionState is). */
  getSessionInfo: () => SessionInfo;
  /** Called with the DriftInfo to surface, e.g. sent over IPC as 'drift-detected'. */
  onDistraction: (data: DriftInfo) => void;
}

export class PickupDistractionReceiver {
  private unsubscribe: Unsubscribe | null = null;

  constructor(private deps: PickupReceiverDeps) {}

  start(): void {
    if (this.unsubscribe) return; // already listening
    this.unsubscribe = this.deps.transport.subscribe((event) => this.handleEvent(event));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  get listening(): boolean {
    return this.unsubscribe !== null;
  }

  /** Exposed for direct unit testing without going through a real transport. */
  handleEvent(event: PhonePickupEvent): void {
    if (event.type !== 'phone_pickup') return;

    const sessionInfo = this.deps.getSessionInfo();
    const decision = decidePickupDistraction({
      event,
      sessionActive: sessionInfo.active,
      sessionPaused: sessionInfo.paused,
    });

    if (decision) {
      this.deps.onDistraction(decision);
    }
  }
}
