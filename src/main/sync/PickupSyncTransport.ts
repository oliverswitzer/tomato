/**
 * Electron-side mirror of `mobile/src/sync/SyncTransport.ts`.
 *
 * Why a mirror instead of a cross-package import: the root Electron app and
 * `mobile/` are deliberately separate npm packages (see repo structure rules
 * in the spike plan — RN/Expo deps must never land in the root
 * package.json). Importing mobile's TS source directly from `src/main` would
 * create an implicit cross-package coupling that isn't declared anywhere
 * (no workspace, no dependency), so instead this type/interface is ported
 * here the same way the Tomato branding tokens were ported into the RN theme
 * in U01 — kept intentionally identical in shape so the two sides can be
 * reconciled or unified behind a shared package later if this spike graduates
 * to a real project.
 *
 * Keep `PhonePickupEvent` and `SyncTransport` in sync with the mobile
 * versions if either changes.
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
