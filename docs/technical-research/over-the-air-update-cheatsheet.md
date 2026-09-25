# Sparkle auto-update: a cheat sheet

Everything below is running in production in a shipped macOS app. Copy the shape, swap the placeholders.

Placeholders used throughout: `MyApp` (app name), `com.example.myapp` (bundle id), `$FEED_BASE` (your public host prefix), `myapp-notary` (your notarytool keychain profile).

The whole thing is four moving parts:

1. Your app embeds `Sparkle.framework` and reads a feed URL from `Info.plist`.
2. You sign each release DMG with an **EdDSA key** (separate from your Apple cert).
3. `generate_appcast` writes an `appcast.xml` describing your releases.
4. You upload the DMG plus the appcast to any static host. Sparkle polls it.

No server, no backend. A public S3 bucket (or R2, or GitHub Releases) is enough.

---

## 1. One time setup

### Add the dependency

SwiftPM:

```swift
.package(url: "https://github.com/sparkle-project/Sparkle.git", from: "2.6.0")
```

Xcode: File > Add Packages, same URL. Xcode embeds and signs the framework for you, so you can skip step 3 below.

### Generate your signing keys

Sparkle ships the tools inside the resolved artifact:

```bash
swift package resolve
.build/artifacts/sparkle/Sparkle/bin/generate_keys
```

That stores the **private** key in your login keychain and prints the **public** key. Print it again any time with `generate_keys -p`.

Back up the private key (`generate_keys -x key.txt`) and put it somewhere safe. Lose it and every existing install stops accepting updates.

### Info.plist keys

```xml
<key>SUFeedURL</key>
<string>https://$FEED_BASE/appcast.xml</string>
<key>SUPublicEDKey</key>
<string>PASTE_YOUR_PUBLIC_KEY_FROM_generate_keys</string>
<key>SUEnableAutomaticChecks</key>
<true/>
<key>SUScheduledCheckInterval</key>
<integer>3600</integer>
```

`SUPublicEDKey` is the base64 public key `generate_keys` printed. It is safe to ship in the bundle, that is the point of it. The private half never leaves your keychain.

---

## 2. The Swift side is about 20 lines

```swift
import SwiftUI
import Combine
import Sparkle

@MainActor
final class UpdaterService: ObservableObject {
    static let shared = UpdaterService()
    private let controller: SPUStandardUpdaterController

    /// Mirrors SPUUpdater.canCheckForUpdates so the menu item can disable
    /// itself while a check is already in flight.
    @Published var canCheckForUpdates = false

    private init() {
        controller = SPUStandardUpdaterController(
            startingUpdater: true,      // begins scheduled checks after launch
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
        controller.updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)
    }

    /// User-initiated check. Shows UI even when already up to date,
    /// unlike the silent scheduled check.
    func checkForUpdates() { controller.updater.checkForUpdates() }
}
```

Menu item:

```swift
.commands {
    CommandGroup(after: .appInfo) {
        Button("Check for Updates…") { updater.checkForUpdates() }
            .disabled(!updater.canCheckForUpdates)
    }
}
```

That is the entire integration. Sparkle owns the update UI, the download, and the in place install.

---

## 3. Embedding the framework (SwiftPM only)

If you build the `.app` bundle by hand with SwiftPM instead of Xcode, you own two things Xcode would have done.

**a) An rpath so the executable can find the framework at runtime:**

```swift
linkerSettings: [
    .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])
]
```

**b) Copy the framework in and sign it inside out.** Nested code signs first, container last, or the outer signature will not seal:

```bash
FW_SRC=.build/artifacts/sparkle/Sparkle/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework
cp -R "$FW_SRC" "$APP/Contents/Frameworks/"

V="$APP/Contents/Frameworks/Sparkle.framework/Versions/B"
for item in \
    "$V/XPCServices/Downloader.xpc" \
    "$V/XPCServices/Installer.xpc" \
    "$V/Updater.app/Contents/MacOS/Updater" \
    "$V/Updater.app" \
    "$V/Autoupdate" \
    "$APP/Contents/Frameworks/Sparkle.framework"
do
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$item"
done
```

Use `cp -R`, not `cp -r`, so the `Versions/Current` symlink survives.

**Add a launchability gate.** A bundle missing the embedded framework passes `swift build`, passes `codesign`, installs fine, and then dies on the user's machine with `dyld: Library not loaded: @rpath/Sparkle.framework/...`. We shipped exactly that once. The check is three lines:

```bash
otool -L "$APP/Contents/MacOS/$EXE" | awk '/@rpath\//{print $1}' | while read -r dep; do
    rel="${dep#@rpath/}"
    [ -e "$APP/Contents/Frameworks/$rel" ] || [ -e "/usr/lib/swift/$rel" ] \
        || { echo "MISSING: $dep"; exit 1; }
done
```

Your build machine has an Xcode toolchain rpath that users do not. Never let that be what resolves your dependency.

---

## 4. Publishing a release

Order matters: sign, notarize, staple, then generate the appcast from the stapled DMG.

```bash
# 1. sign the app with Developer ID + hardened runtime
codesign --force --timestamp --options runtime \
    --entitlements clean.plist --sign "Developer ID Application" "$APP"

# 2. build the DMG, then notarize and staple it
xcrun notarytool submit "$DMG" --keychain-profile myapp-notary --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"        # this is the real gate

# 3. generate + EdDSA-sign the appcast
curl -fsSL "https://$FEED_BASE/appcast.xml" -o build/appcast/appcast.xml || true   # keep old entries
.build/artifacts/sparkle/Sparkle/bin/generate_appcast build/appcast \
    --download-url-prefix "https://$FEED_BASE/" \
    -o build/appcast/appcast.xml

# 4. upload DMG first, appcast LAST
```

Upload order is not cosmetic. Publish the appcast last so it can never point at a DMG that is not up yet.

`generate_appcast` scans a directory of DMGs, merges anything already in the output file, and signs each entry with the keychain private key. It is the whole release-notes and versioning story, so you never hand write XML.

---

## 5. The five things that will bite him

**1. `sparkle:version` must strictly increase, and Sparkle only ever offers a HIGHER number.** Repeat or regress a build number and the update is not rejected, it is invisible. No error anywhere.

Best fix we found: stop hand-bumping. Derive it from git.

```bash
git rev-list --count HEAD
```

Monotonic, a fact of history, no "bump version" commits. One catch: `rev-list --count` is branch relative, so a feature branch runs ahead of where main lands after a squash merge. Cut releases from main only, or you will stamp a number main later reaches on its own.

**2. Your dev builds will silently eat your released app.** If a local build installs to the same path with the same bundle id and a higher number, it becomes the thing on disk, and Sparkle will never offer a real update over it. Give dev builds their own bundle id and their own install path (`MyApp Dev.app`, `com.example.myapp.dev`) and turn `SUEnableAutomaticChecks` off there.

**3. Verify the artifact, never the build log.** Our build script caught notarization failures, kept going, printed a cheerful success banner, and skipped the appcast publish. Testers got nothing while the log read green. The three checks that actually mean something:

```bash
xcrun stapler validate "$DMG"                       # "The validate action worked!"
spctl --assess --type execute "$APP"                # "Notarized Developer ID"
curl -s "$FEED_URL" | grep sparkle:version          # the live feed advertises N
```

**4. Add a collision check before publishing.** Fetch the live appcast, parse the max `sparkle:version`, refuse to publish if your build is not greater. Checks the real artifact rather than a git topology proxy.

**5. Ad-hoc signed builds cannot install appcast updates.** Sparkle refuses an update signed by a different identity. That is correct behavior, but it looks like a broken updater when you are testing locally. Test the update path with a real Developer ID build.

---

## 6. Hosting

Anything static. Requirements are only:

- Public read on the DMG and the appcast.
- Correct content types (`application/xml` for the appcast).
- Stable URL for the appcast, since it is baked into every shipped binary. Getting that wrong is unrecoverable for existing installs.

We use a public S3 prefix with a bucket policy. GitHub Releases works too, and `generate_appcast --download-url-prefix` points at wherever the files land.

---

## The pieces, as separate files

Splitting these out is what made the pipeline debuggable. Each one is independently runnable against an existing artifact.

| Piece | What it owns |
|---|---|
| `UpdaterService.swift` | The 20 line Swift integration |
| `embed-sparkle.sh` | Copy the framework in, sign it inside out |
| `verify-bundle-launchable.sh` | Refuse to ship a bundle that would die at launch |
| `publish-appcast.sh` | Generate, EdDSA sign, upload. Runnable by hand against any notarized DMG |
| `build-number.sh` | Single source of truth for the version integer |
| `build-dmg.sh` | Orchestrates the above, plus notarize and staple |

Ask and I will send the real versions of any of these.
