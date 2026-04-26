# Electron macOS Permissions Testing

Use this skill when testing or debugging macOS permission flows (Screen Recording, Accessibility, Microphone, Camera) in packaged Electron apps.

## Reset permissions for testing

Reset the TCC (Transparency, Consent, and Control) database for a specific app bundle ID:

```bash
tccutil reset ScreenCapture <bundle.id>
tccutil reset Accessibility <bundle.id>
tccutil reset Microphone <bundle.id>
tccutil reset Camera <bundle.id>
```

Find the bundle ID from the app's signature:
```bash
codesign -dvv /path/to/App.app 2>&1 | grep Identifier
```

## Code signing for stable permissions

Ad-hoc signing (`codesign --sign -`) generates a different hash every build, which **revokes all permissions on each rebuild**. Use a self-signed certificate instead:

### Create a certificate (one-time, via Keychain Access UI)
1. Open Keychain Access
2. Menu → Certificate Assistant → Create a Certificate...
3. Name: anything (e.g. "My Dev")
4. Identity Type: Self Signed Root
5. Certificate Type: **Code Signing**
6. Click Create
7. Right-click the cert → Get Info → Trust → Code Signing → Always Trust

### Sign the app after building
```bash
# Sign embedded binaries first with the app's bundle identifier
codesign --sign "My Dev" --force --identifier <bundle.id> /path/to/App.app/Contents/Resources/embedded-binary

# Then sign the whole app
codesign --sign "My Dev" --force --deep /path/to/App.app
```

### Verify
```bash
codesign -dvv /path/to/App.app 2>&1 | grep -E "Authority|Identifier"
```

## Requesting permissions from Electron

### Screen Recording
`desktopCapturer.getSources()` triggers macOS to register the app in the Screen Recording list:
```typescript
await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
```

### Accessibility
`systemPreferences.isTrustedAccessibilityClient(true)` registers the app and shows the system prompt. Passing `false` only checks without prompting:
```typescript
// Check only
const granted = systemPreferences.isTrustedAccessibilityClient(false);
// Check + prompt + register
const granted = systemPreferences.isTrustedAccessibilityClient(true);
```

### Screen Recording status check
```typescript
const granted = systemPreferences.getMediaAccessStatus('screen') === 'granted';
```

### Microphone / Camera
```typescript
const granted = await systemPreferences.askForMediaAccess('microphone'); // or 'camera'
```

## Common pitfalls

- **Rebuilding revokes permissions** when using ad-hoc signing. Use a self-signed certificate.
- **Child processes** (e.g. a bundled binary) need to be signed with the **same identifier** as the parent app, or they get their own separate permission entry.
- **Multiple prompts** happen when both the Electron app AND a child process independently request the same permission. Have only one trigger the request.
- **`electron-builder`** sets `identity: null` by default. Add a post-build codesign step in your pack script.
- **`electron-rebuild`** changes the native module ABI. Always run it before `electron-builder` to ensure native modules (e.g. `better-sqlite3`) match Electron's Node version, not system Node.

## Build script pattern

```json
{
  "pack": "npm run build && npx electron-rebuild && electron-builder --mac --dir && codesign --sign 'My Dev' --force --identifier com.my.app release/mac-arm64/MyApp.app/Contents/Resources/embedded-binary && codesign --sign 'My Dev' --force --deep release/mac-arm64/MyApp.app"
}
```
