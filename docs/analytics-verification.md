# Verifying the PostHog funnel

The project token is compiled into `src/config/analytics.ts` and `splash/index.html`. A `phc_`
project token is a public, write-only key, which is why it is committed. A `phx_` personal API
key has read access and must never enter the repo — which also means nothing in this repo can
read events back out of PostHog. Everything below therefore verifies the **send** side and
asserts on what PostHog answers, then leaves one human step in the project UI.

## Automated

```bash
npm run verify            # offline. The live suite is skipped.
npm run verify:analytics  # opt-in. Talks to the real project.
```

`npm run verify:analytics` runs `src/main/__tests__/analytics.live.test.ts`, which asserts:

1. `GET https://us.i.posthog.com/array/<token>/config` returns `200` with
   `{"analytics":{"endpoint":"/i/v0/e/"}}`, and the EU host returns `404` — so the token is valid
   and `POSTHOG_HOST` names the right region.
2. The same config endpoint returns `404` for a token that is not this project, which is what
   makes (1) a real validity check rather than a "the host is up" check.
3. `POST https://us.i.posthog.com/i/v0/e/` with the compiled-in token returns
   `200 {"status":"Ok"}` — so the project accepts our capture shape.
4. All eight captures in the catalog flush through the real `posthog-node` transport with no
   `capture failed` and no `shutdown failed`, each tagged `"environment":"development"`.
5. `createPostHogTransport('')` still returns `null`, so the inert path stays provable.

### A trap worth recording

The ingest endpoint answers `200 {"status":"Ok"}` **even for a token that belongs to no project** —
verified by hand against `us.i.posthog.com`. So a successful `POST /i/v0/e/` proves only that the
request shape was accepted; it is *not* evidence that the token is live. Token validity comes
entirely from the `/array/<token>/config` probes, which 404 for a bogus token and for the wrong
region. (An earlier draft of this check asserted `{"status":1}`, which the endpoint does not
return at all.)

The live suite writes to the real project under a throwaway `distinct_id` derived from the clock,
never from a real machine id, and uses the event name `tomato_live_check` for its raw HTTP probe
rather than a real funnel event.

### Observed run

`npm run verify:analytics` — 5 tests passed. The catalog flush ran under throwaway
`distinct_id` `87836b92228df61bcfdb3a4773cedd88`. That is a 32-hex anonymous id and bears no
relation to this machine's `IOPlatformUUID` (`F3EDB359-…`, confirmed different), which is the
point of `anonymousDistinctId()`.

The splash half was walked in a real Chrome against a local static server. Console output:

```
[analytics] download_intent {"cta_location":"hero"} env=development
[analytics] download_gate_abandoned {"dismiss_method":"escape"} env=development
[analytics] download_intent {"cta_location":"hero"} env=development
[analytics] download_completed {} env=development
```

`posthog.get_property('environment')` returned `'development'`, and a `before_send` hook showed
the wire-bound events as `download_intent`, `download_gate_abandoned`, `download_completed` and
`$pageview` — all four carrying `environment: 'development'`, which is what makes `register()`
rather than per-call properties the right mechanism. Delivery confirmed by
`POST https://us.i.posthog.com/e/` → `200 {"status":"Ok"}`. The hostname branch was evaluated
directly: `tomatoapp.dev` and `www.tomatoapp.dev` → `production`; `localhost` and
`tomato-git-abc.vercel.app` → `development`.

## By hand

- **App:** `npm run dev`, then watch `~/Library/Application Support/tomato/tomato.log` (which
  `scripts/dev.js` tails). Every event appears as an `[analytics]` line carrying
  `"environment":"development"`. The goal text and the `sk-ant` API key appear on no such line.
- **Splash:** serve `splash/` and open the console. Clicking a download CTA logs
  `download_intent`; Escape logs `download_gate_abandoned`; submitting a valid email logs
  `download_completed`. Each line ends `env=development`. The gate lives entirely in
  `splash/index.html`, which intercepts every `a[href="download.html"]`; `download.html` itself
  has no analytics.

  **Trap: do this in a real browser, not an automated one.** `posthog-js` silently drops every
  capture when `navigator.webdriver` is `true`, so a Puppeteer/CDP-driven Chrome logs the
  `[analytics]` console lines and initialises the client but sends *nothing* — no request ever
  reaches the ingest endpoint. Verified: with `navigator.webdriver` stubbed to `false`, the same
  walk immediately produces `POST https://us.i.posthog.com/e/` → `200 {"status":"Ok"}`. If you
  must verify under automation, neutralise `navigator.webdriver` first, or confirm the outgoing
  event with a `before_send` hook rather than trusting the network tab.
- **Opt-out:** Settings → **Share anonymous usage data** off stops all events immediately, with
  no restart.
- **Inert:** `TOMATO_POSTHOG_TOKEN= npm run dev` logs
  `[analytics] transport disabled …` and sends nothing.

## Reading the funnel in PostHog

Every dashboard, insight and funnel must filter **`environment = 'production'`**. Without it,
local dev runs, Vercel preview deploys and the live check above all land in the numbers.

- `environment = 'development'` — `npm run dev`, `localhost`, `file://`, and any `*.vercel.app`
  preview URL.
- `environment = 'production'` — a packaged build (`app.isPackaged`) and the `tomatoapp.dev`
  domain only.
- `tomato_live_check` — the diagnostic event from `npm run verify:analytics`. Exclude it.

The web funnel is `$pageview → download_intent → download_completed`, with
`download_gate_abandoned` as the drop-off. The app funnel is
`app_launched → onboarding_step_completed → onboarding_completed → session_started →
session_ended`, and retention is repeat `session_started` per `distinct_id`.

## The one step no code here can take

Reading events back needs a `phx_` personal API key, which must not be committed. So open the
PostHog project's activity view by hand and confirm `app_launched`, `session_started` and
`session_ended` appear against a single anonymous 32-hex `distinct_id` that is **not** the
machine's `IOPlatformUUID` (compare against
`ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID`). Record the result here when done.
