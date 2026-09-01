# Tomato Companion (iOS) — spike

A React Native (Expo) companion app for Tomato. Core idea: detect when the
phone is picked up during a focus session and surface that as a
possible-distraction signal in the Electron app, the same way LLM-driven
drift detection already does.

**Status: spike, not shippable.** This is a buildable starting point for
morning review, not a device-verified app. See "What's real vs. mocked"
below and the root `KNOWN-GAPS.md` for the full honest accounting.

## What's real vs. mocked

Real and unit-tested:
- `src/pickup/pickupDetector.ts` — a pure `detectPickup(samples, config)`
  function that decides "picked up" from a short window of accelerometer
  samples (sustained tilt delta + a motion/jerk spike, both required). No
  RN/device dependency, fully unit-tested.
- `src/sync/` — a `SyncTransport` interface with two working
  implementations: `InMemorySyncTransport` (same-process, used by `App.tsx`)
  and `FileSyncTransport` (Node `fs`-backed, proves real cross-process
  delivery in tests). Both are exercised end-to-end by real
  publish/subscribe round-trips, not stubs.
- `src/theme/tomatoTheme.ts` — the Tomato cream/red editorial palette and
  Newsreader serif / Geist Mono font names, ported by hand from the
  Electron app's Tailwind `@theme` tokens in `src/renderer/index.css` (RN
  can't consume Tailwind CSS directly). `App.tsx` renders using this theme.
- The Electron-side receiver (`../src/main/sync/`) that subscribes to the
  same `SyncTransport` interface and reuses the existing drift/nudge path
  (`sessionStore.ts`'s `driftInfo`, `focus-tracker.ts`'s `onDrift`) to show
  the possible-distraction UI on a pickup event.

Mocked / not real:
- **iCloud/CloudKit cross-device sync is NOT implemented.** There is no
  `CloudKitSyncTransport`. The RN app currently uses `InMemorySyncTransport`
  (same JS process only — doesn't even leave the app). The Electron receiver
  is wired to a `FileSyncTransport` pointed at a shared OS-temp-dir file,
  which proves cross-*process* delivery on one dev machine, not cross-*device*
  delivery over iCloud. Going from mock to real CloudKit requires an Apple
  Developer Program team, an iCloud container, and signed entitlements —
  see the root `KNOWN-GAPS.md` for the exact steps. **Never claim iCloud
  sync works — it doesn't yet.**
- Device/simulator runtime is entirely unverified. This build machine has
  only Xcode Command Line Tools, no full Xcode, no iOS Simulator. The app
  has never been built, run, or screenshotted. Runtime verification
  (does `expo-sensors` actually report sane accelerometer values in this
  app, does the UI render correctly, does a real pickup gesture trip the
  detector's thresholds) is pending an Xcode environment.
- Detector thresholds (`pickupDetector.ts`'s default config) are reasonable
  guesses, not calibrated against real device motion data. Expect to retune
  after real-device testing.

## Running this (once Xcode is available)

This has not been run. Expected steps on a machine with full Xcode and the
iOS Simulator (or a physical device + Apple ID for signing):

```bash
cd mobile
npm install
npm run ios      # or: npm start, then press "i"
```

`expo-sensors`' `Accelerometer` needs a physical device or a simulator that
reports motion data — the iOS Simulator can synthesize limited motion via
Features > Face ID / motion tools, but real pickup-gesture testing needs a
physical device.

## Verification that *has* run here (no device required)

```bash
cd mobile
npm run verify    # tsc --noEmit && jest
```

This runs typecheck + the full unit test suite (pure `pickupDetector`
logic, both `SyncTransport` implementations, the publisher helper, the
theme values) — all real, no device or simulator involved.

## Layout

```
mobile/
  App.tsx                      # top-level screen, wires theme + hook + transport
  src/
    theme/tomatoTheme.ts       # ported Tomato @theme tokens (see comment for source)
    pickup/pickupDetector.ts   # pure accelerometer-window -> pickup decision
    hooks/usePickupDetection.ts# expo-sensors Accelerometer -> pickupDetector -> onPickup/publish
    sync/
      SyncTransport.ts         # interface: publish/subscribe PhonePickupEvent
      inMemorySyncTransport.ts # same-process mock (used by App.tsx)
      fileSyncTransport.ts     # cross-process mock (Node fs, JSON-lines, polled)
      pickupPublisher.ts       # thin publish helper used by the hook
```

The Electron-side receiver lives outside `mobile/`, in the root package at
`src/main/sync/` (`PickupSyncTransport.ts`/`fileSyncTransport.ts` — an
intentional port of the mobile transport shape, not a cross-package import,
so `mobile/` stays dependency-free of the root Electron package and
vice versa) and `PickupDistractionReceiver.ts` (subscribes, decides via the
pure `pickupDistractionDecision.ts`, and drives the existing
`drift-detected` IPC path in `main.ts`).

## Why a separate package

Per the repo's spike scope, `mobile/` has its own `package.json` and RN/Expo
deps are never added to the root Electron `package.json`. The two packages
are verified independently: root `npm run verify` (typecheck + vitest) stays
green untouched, and `mobile && npm run verify` (typecheck + jest) is its
own gate.
