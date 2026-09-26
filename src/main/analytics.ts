import type { AnalyticsEvent, AnalyticsEnvironment } from '../shared/analytics-events';

export interface CapturePayload {
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
}

/** The seam. Real implementation lives in ./posthog-transport; tests pass a fake. */
export interface AnalyticsTransport {
  capture(payload: CapturePayload): void;
  shutdown(timeoutMs: number): Promise<void>;
}

export interface Analytics {
  capture(event: AnalyticsEvent): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  shutdown(): Promise<void>;
}

export interface AnalyticsDeps {
  /** null when no project token is compiled in — log locally, send nothing. */
  transport: AnalyticsTransport | null;
  distinctId: string;
  enabled: boolean;
  /** Stamped onto every event so production funnels can exclude dev runs. */
  environment: AnalyticsEnvironment;
  log: (msg: string) => void;
  shutdownTimeoutMs?: number;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2000;

/**
 * The only module the rest of the app talks to about analytics.
 *
 * Capture is fire-and-forget and non-fatal: a transport failure is logged and
 * swallowed, because analytics must never be able to break a focus session.
 */
export function createAnalytics(deps: AnalyticsDeps): Analytics {
  const { transport, distinctId, log, environment } = deps;
  const shutdownTimeoutMs = deps.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let enabled = deps.enabled;

  return {
    capture(event: AnalyticsEvent): void {
      if (!enabled) return;
      // Stamped here, not at the call sites, so no event can be emitted untagged and
      // AnalyticsEvent stays free of anything a caller has to remember to set.
      const properties = { ...event.properties, environment };
      log(`[analytics] ${event.name} ${JSON.stringify(properties)}`);
      if (!transport) return;
      try {
        transport.capture({ distinctId, event: event.name, properties });
      } catch (err) {
        log(`[analytics] capture failed for ${event.name}: ${(err as Error).message}`);
      }
    },

    setEnabled(next: boolean): void {
      enabled = next;
    },

    isEnabled(): boolean {
      return enabled;
    },

    async shutdown(): Promise<void> {
      if (!transport) return;
      // Bound the flush: a network stall must never hang quitting the app.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, shutdownTimeoutMs);
        timer.unref?.();
      });
      try {
        await Promise.race([transport.shutdown(shutdownTimeoutMs), deadline]);
      } catch (err) {
        log(`[analytics] shutdown failed: ${(err as Error).message}`);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
