// The complete set of analytics events, as a discriminated union.
//
// This file IS the privacy guarantee. A caller cannot invent an event or attach a
// free-text field, because the type will not allow it. Nothing here carries the
// user's intention text, window titles, OCR content, the API key, or file paths.

export type OnboardingStep = 'screen_permission' | 'accessibility_permission' | 'api_key';

export type SessionEndReason = 'completed' | 'user_ended' | 'app_quit';

/**
 * Stamped onto every event as the `environment` property.
 *
 * A `npm run dev` run and a packaged install are otherwise indistinguishable in PostHog, so
 * local testing would inflate the very download → setup → retention funnel this
 * instrumentation exists to measure. Production dashboards filter `environment = 'production'`.
 *
 * A closed union, like every other property in this file — it adds no free-text surface.
 */
export type AnalyticsEnvironment = 'development' | 'production';

export type AnalyticsEvent =
  | { name: 'app_launched'; properties: { app_version: string; is_first_launch: boolean } }
  | { name: 'onboarding_step_completed'; properties: { step: OnboardingStep } }
  | { name: 'onboarding_completed'; properties: { app_version: string } }
  | { name: 'session_started'; properties: { planned_duration_min: number } }
  | {
      name: 'session_ended';
      properties: {
        planned_duration_min: number;
        actual_duration_sec: number;
        ended_early: boolean;
        end_reason: SessionEndReason;
      };
    }
  | { name: 'hud_toggled'; properties: { expanded: boolean } };

export type SessionEndedEvent = Extract<AnalyticsEvent, { name: 'session_ended' }>;

/**
 * `session_ended` carries the planned duration as well as the actual one so the
 * funnel is readable without joining back to `session_started`.
 *
 * A session only counts as "ended early" when something other than the timer
 * running out stopped it. Keying off the reason rather than a pure duration
 * comparison avoids an off-by-one-second flap when the timer reaches zero.
 */
export function buildSessionEndedEvent(input: {
  plannedDurationMin: number;
  startedAtMs: number;
  endedAtMs: number;
  endReason: SessionEndReason;
}): SessionEndedEvent {
  const actualDurationSec = Math.max(0, Math.round((input.endedAtMs - input.startedAtMs) / 1000));
  const plannedSec = input.plannedDurationMin * 60;
  return {
    name: 'session_ended',
    properties: {
      planned_duration_min: input.plannedDurationMin,
      actual_duration_sec: actualDurationSec,
      ended_early: input.endReason !== 'completed' && actualDurationSec < plannedSec,
      end_reason: input.endReason,
    },
  };
}
