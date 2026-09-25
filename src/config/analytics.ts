// PostHog project token. A project token is a PUBLIC, write-only key — safe to ship
// in a client. It is compiled in here rather than read from process.env because a
// packaged macOS app launched from Finder does not inherit shell environment
// variables (see CLAUDE.md). This is unlike ANTHROPIC_API_KEY, which is secret and
// must stay out of the bundle.
//
// Empty by default: with no token the app logs [analytics] lines locally and sends
// nothing, which keeps dev runs and CI out of the production project. A human pastes
// the real token here once the PostHog project exists.
export const POSTHOG_PROJECT_TOKEN = '';

// 'https://us.i.posthog.com' or 'https://eu.i.posthog.com', matching the project's region.
export const POSTHOG_HOST = 'https://us.i.posthog.com';
