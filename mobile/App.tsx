import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tomatoTheme } from './src/theme/tomatoTheme';
import { usePickupDetection } from './src/hooks/usePickupDetection';
import { createInMemorySyncTransport } from './src/sync/inMemorySyncTransport';

export default function App() {
  // Spike-scope: this app has no real cross-device transport wired in (that
  // needs iCloud/CloudKit — see KNOWN-GAPS.md). The in-memory SyncTransport
  // below proves the RN app's publish path against the same `SyncTransport`
  // interface the Electron receiver will subscribe to (U04), but it only
  // delivers within THIS process, so it does not itself prove cross-device
  // delivery. A `FileSyncTransport` (Node-only, see
  // `src/sync/fileSyncTransport.ts`) or a future `CloudKitSyncTransport` can
  // be swapped in here without touching the hook or publisher.
  const syncTransportRef = useRef(createInMemorySyncTransport());
  const { pickedUp } = usePickupDetection({ syncTransport: syncTransportRef.current });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tomato Companion</Text>
      <Text style={styles.subtitle}>
        Spike scaffold — cross-device sync is mocked pending an Xcode +
        Apple Developer environment (see KNOWN-GAPS.md).
      </Text>
      <Text style={styles.status}>
        {pickedUp ? 'Pickup detected' : 'Resting'}
      </Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tomatoTheme.colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontFamily: tomatoTheme.fonts.serif,
    color: tomatoTheme.colors.text,
    fontSize: 28,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: tomatoTheme.fonts.mono,
    color: tomatoTheme.colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  status: {
    fontFamily: tomatoTheme.fonts.mono,
    color: tomatoTheme.colors.accent,
    fontSize: 16,
    marginTop: 16,
  },
});
