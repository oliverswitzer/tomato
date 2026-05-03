# Product Stack Evaluation: Analytics, Payments, A/B Testing, Feedback & Comms

**Date:** 2026-05-03
**Context:** Tomato is a privacy-first macOS Electron pomodoro app approaching first public launch. Distributed as a direct DMG download (not Mac App Store). No user account system — users bring their own Anthropic API key. Currently at zero instrumentation, no payment system, no structured feedback channel. Repo is private.

---

## Current State

- **Analytics:** None in-app. Splash page has no Vercel Analytics configured.
- **Payments:** None. App is free, requires user's own API key.
- **A/B testing:** None.
- **Feedback:** None. No Canny integration despite having an account.
- **Comms:** Loops.so waitlist collection already wired up on the splash page (`splash/api/subscribe.js`), capturing email + UTM params + referrer.

---

## 1. Analytics

### The Key Question

> What decisions would analytics data actually unlock right now?

At <100 users, the decisions are narrow:

1. **Are people actually using the app after downloading?** (retention signal)
2. **Which features are being used?** (session length, pause frequency, drift detection engagement)
3. **Where do users drop off?** (onboarding completion rate)
4. **How are people finding us?** (splash page referral sources)

These are answerable with very lightweight instrumentation. A full product analytics suite is not required.

### Option A: Vercel Analytics (splash page only)

| Aspect | Detail |
|--------|--------|
| **Free tier** | 50,000 events/month (pageviews + custom events) |
| **Features** | Pageviews, custom events, referrers, UTM params, geo, device breakdown |
| **Privacy** | Cookie-free, no PII, no consent banner needed, GDPR/CCPA compliant |
| **Limitations** | No funnels, cohorts, retention analysis. No user-level profiles. Web-only — cannot track in-app Electron events. No raw data export on free tier. |
| **Effort** | Near-zero — already on Vercel, add `@vercel/analytics` to the splash page |

**Verdict: YES — add now.** Covers splash page traffic, download clicks, and referral sources at zero cost and zero complexity. But this only covers the web funnel, not in-app behavior.

### Option B: PostHog (full product analytics)

| Aspect | Detail |
|--------|--------|
| **Free tier** | 1M events/month, 5K session recordings, 1M feature flag requests |
| **Electron integration** | Use `posthog-js` in renderer (Chromium-based), `posthog-node` in main process. No official Electron SDK, but works well. |
| **Privacy** | Autocapture can be disabled. IP anonymization available. `opt_out_capturing()` per user. Self-hostable (MIT license). Cloud offers US + EU regions. |
| **Session replay** | Works in renderer (DOM-based via rrweb). Does not capture native OS UI. |
| **Feature flags** | Full support: boolean, multivariate, percentage rollouts, A/B payloads. |
| **Effort** | ~1-2 hours for basic setup. One `posthog.init()` call + `posthog.capture()` where needed. Adds ~50-80KB gzipped to renderer. |

**Verdict: LATER — not needed at launch.** PostHog is genuinely free at this scale and not complex to integrate, but it's solving a problem we don't have yet. At <100 users, we can talk to every user directly. Add PostHog when we need to understand behavior at scale (100+ users) or want feature flags for controlled rollouts.

### Option C: Lightweight self-hosted events

A single serverless function (Vercel or Supabase Edge Function) that inserts rows into a Postgres table. ~50 lines of code. Track 3-5 events: `app_launched`, `session_started`, `session_completed`, `onboarding_completed`, `drift_detected`.

| Aspect | Detail |
|--------|--------|
| **Cost** | Free at low volume (Supabase free tier or Vercel Postgres) |
| **Privacy** | Full control, no third-party data sharing, no PII needed |
| **Effort** | A few hours to build endpoint + simple `fetch()` calls from Electron main process |
| **Limitations** | No pre-built dashboard — query SQL directly or build a simple one |

**Verdict: YES — build a minimal version for launch.** This is the right level of instrumentation for our stage. 3-5 events, no user identification needed (use anonymous machine hash), full privacy control. Gives us the retention and feature usage signal we actually need.

### Recommendation

**Launch with both:**

1. **Vercel Analytics** on the splash page (web funnel: traffic, downloads, referrers)
2. **Minimal self-hosted events endpoint** for in-app telemetry (3-5 anonymous events)

**Add PostHog later** when we need feature flags, session replay, or deeper behavioral analytics (100+ users).

---

## 2. Payments

### Comparison

| | Paddle | Lemon Squeezy | Stripe (direct) | RevenueCat |
|--|--------|---------------|------------------|------------|
| **Pricing** | 5% + $0.50/txn | 5% + $0.50/txn | 2.9% + $0.30/txn | Free to $2.5K rev |
| **Merchant of Record** | Yes | Yes | No | No |
| **Tax/VAT handling** | Full (they file) | Full (they file) | You file (Stripe Tax add-on calculates only) | N/A |
| **License keys** | Built-in | Built-in | Build your own | No |
| **Desktop app support** | Purpose-built | Supported | Supported | **Not viable** (requires StoreKit/App Store) |
| **Electron integration** | Checkout URL in BrowserWindow + API verification | Checkout URL + REST API verification | Checkout + webhooks + custom license infra | N/A |
| **Privacy** | MoR handles billing PII | MoR handles billing PII | You are data controller | N/A |

### Analysis

**RevenueCat: ELIMINATE.** Does not support non-App Store macOS distribution. It wraps StoreKit and platform stores — incompatible with DMG distribution.

**Stripe (direct): HIGH EFFORT.** Lower transaction fees (2.9% vs 5%), but requires building license key infrastructure, handling tax compliance, and being the merchant of record. The engineering and legal overhead far exceeds the fee savings at our scale.

**Lemon Squeezy: STRONG OPTION.** Now owned by Stripe (acquired 2024). Identical pricing to Paddle with MoR + license keys. Slightly less mature for desktop apps — originally focused on digital products/SaaS. The Stripe backing adds long-term stability.

**Paddle: STRONGEST OPTION.** Purpose-built for desktop software. Battle-tested by indie Mac apps (Sketch, Nova, many others). MoR eliminates all tax/VAT burden. Built-in license keys with activation/deactivation/device limits. Simple Electron integration: open checkout URL, verify license via API.

### Recommendation

**Paddle when we're ready to monetize.** The 5% fee is worth it for MoR + tax handling + built-in license keys. This is not needed at launch — implement when we have a monetization strategy and enough users to justify it.

**Lemon Squeezy is a viable backup** if Paddle's terms or feature set don't work for some reason.

---

## 3. A/B Testing

### The Hard Truth

**A/B testing is statistically meaningless at <100 users.** You need ~1,000+ observations per variant to detect moderate effect sizes with acceptable statistical power. At our scale, you cannot distinguish signal from noise.

### What Actually Works at Our Scale

**Feature flags** (not A/B tests) for controlled rollouts:

| Option | Electron Support | Free Tier | Privacy | Complexity |
|--------|-----------------|-----------|---------|------------|
| **PostHog feature flags** | JS SDK in renderer, Node SDK in main | 1M requests/month | Self-hostable | Low |
| **LaunchDarkly** | JS client SDK | No free tier (~$8.33/mo min) | Cloud only | Low |
| **Statsig** | JS/Node SDK | 10M events/month | Cloud only | Medium |
| **JSON config from API** | Native fetch | Free (your infra) | Full control | Minimal |

### Recommendation

**Skip A/B testing entirely for now.** It's not meaningful at our scale.

**For feature flags** (gradual rollouts, beta features): use a **simple JSON config** fetched from our own endpoint. Hash the machine ID to deterministically assign flag buckets. Zero dependencies, no third-party data sharing, ~30 lines of code.

```
GET /api/flags → { "new_hud_design": { "enabled": true, "rollout_pct": 50 } }
```

**Upgrade to PostHog feature flags** when we adopt PostHog for analytics (100+ users), since they're included free.

---

## 4. Feedback: Canny

### Integration Plan

We already have a Canny account. The integration is trivial:

1. Add a **"Send Feedback"** item to the tray menu
2. `shell.openExternal('https://tomato.canny.io')` — opens Canny board in default browser
3. Zero SDK, zero in-app code beyond the menu item

### Configuration Decisions

| Decision | Recommendation | Reasoning |
|----------|---------------|-----------|
| **Public vs private board** | Public | At <50 users, transparency builds trust. Users see others' requests, reducing duplicates. Can always go private later. |
| **User identification** | Email-only | Low friction. No account system needed. Users enter email to post/vote. Lets us follow up. |
| **SSO** | Skip | No account system to federate with. |
| **Changelog** | Enable | Built-in Canny feature. Users who voted on related features get notified. Partially replaces newsletter for product updates. |

### Is Canny Worth It at <50 Users?

**Borderline.** The free tier (1 board, 100 tracked posts) is sufficient. The question is whether the overhead of another tool is worth it vs. simpler alternatives:

- **Google Form / email link:** Lower friction, zero cost, but no voting/prioritization
- **Discord:** Real-time conversation, but feedback gets buried in chat
- **GitHub Issues:** Free, integrated with workflow, but repo is private and users aren't developers

### Recommendation

**YES — integrate Canny at launch.** The integration is trivial (one tray menu item), we already have the account, the free tier covers our needs, and it establishes a structured feedback channel from day one. The public board with changelog also serves as a lightweight comms channel.

---

## 5. Comms: Loops

### Current State

**We already have Loops partially integrated.** The splash page waitlist (`splash/api/subscribe.js`) sends email + UTM params to Loops.so via their API. This is collecting contacts today.

### Assessment

| Aspect | Detail |
|--------|--------|
| **Free tier** | 1,000 contacts, 2,000 emails/month |
| **Current use** | Waitlist email collection on splash page (already working) |
| **What it enables** | Changelog emails, feature announcements, onboarding sequences |
| **Privacy** | Standard email platform (stores email, opens, clicks). GDPR-compliant with consent. |
| **Alternatives** | Canny changelog (pull-based, no inbox delivery), manual BCC email |

### Recommendation

**KEEP the existing Loops integration — it's already built.** Don't invest further in Loops right now. Use it for:

1. **Launch announcement** to the waitlist (one email)
2. **Occasional changelog updates** (monthly at most)

Don't build automated sequences, onboarding drips, or complex campaigns. That's premature before 100+ contacts.

**Canny changelog + Loops** complement each other: Canny for pull-based updates (users visit), Loops for push-based updates (inbox delivery). But at our scale, either alone would suffice.

---

## Privacy Assessment

All recommendations are evaluated against Tomato's privacy-first positioning:

| Tool | Data Sent | PII Collected | Self-Hostable | Privacy Risk |
|------|-----------|---------------|---------------|-------------|
| **Vercel Analytics** | Pageviews, events | None (cookie-free) | No | Very Low |
| **Self-hosted events** | App events | None (anonymous hash) | Yes (it's ours) | None |
| **Canny** | Feedback text, email | Email (voluntary) | No | Low |
| **Loops** | Email, UTMs | Email (voluntary) | No | Low |
| **Paddle** (future) | Billing info | Billing PII (handled by Paddle as MoR) | No | Low (our exposure) |

**No tool in this stack sends screen content, API keys, or detailed user behavior off-device.** The in-app telemetry is anonymous event counts only. Feedback and email collection are voluntary, user-initiated actions.

---

## Recommended Adoption Order

### Phase 1: Launch (Now)

| Tool | Action | Effort |
|------|--------|--------|
| **Vercel Analytics** | Add `@vercel/analytics` to splash page | 30 min |
| **Self-hosted events** | Build minimal endpoint for 3-5 anonymous in-app events | 2-4 hours |
| **Canny** | Add "Send Feedback" tray menu item → opens Canny board | 30 min |
| **Loops** | Already integrated. Send launch announcement to waitlist. | 0 (done) |

### Phase 2: Traction (100+ Users)

| Tool | Action | Trigger |
|------|--------|---------|
| **PostHog** | Replace self-hosted events. Gain feature flags, session replay, deeper analytics. | When we need behavioral insights or controlled rollouts |
| **Canny changelog** | Start posting regular updates | When there's enough to announce |

### Phase 3: Monetization

| Tool | Action | Trigger |
|------|--------|---------|
| **Paddle** | Implement license key checkout flow | When we have a pricing strategy |
| **Loops sequences** | Build onboarding drip, upgrade nudges | When we have paying users to communicate with |

---

## What We Explicitly Skip

| Tool/Category | Why |
|---------------|-----|
| **RevenueCat** | Does not support non-App Store macOS distribution |
| **Stripe (direct)** | MoR + license key overhead not worth the lower fees at our scale |
| **LaunchDarkly** | No free tier, enterprise-grade, overkill |
| **A/B testing** | Statistically meaningless at <100 users |
| **PostHog (at launch)** | Overkill for launch — self-hosted events are sufficient. Adopt at 100+ users. |
| **Session replay** | Powerful debugging tool but premature. Revisit with PostHog adoption. |
| **Email automation** | Drip sequences, onboarding flows — premature before traction |

---

## Summary

The right stack for a privacy-first macOS Electron app at our stage is **deliberately minimal**: Vercel Analytics for the web funnel, a handful of anonymous in-app events we control, Canny for structured feedback, and the Loops integration we already have. Everything else is either premature, incompatible with our distribution model, or solving problems we don't have yet. The upgrade path to PostHog + Paddle is clear when we need it.
