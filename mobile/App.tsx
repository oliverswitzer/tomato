import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { tomatoTheme } from './src/theme/tomatoTheme';
import { usePickupDetection } from './src/hooks/usePickupDetection';

export default function App() {
  // Spike-scope: pickup events are only surfaced locally for now (this
  // status text). Cross-device sync to the Electron app lands in a later
  // unit (U03 SyncTransport) — see PLAN.md / KNOWN-GAPS.md.
  const { pickedUp } = usePickupDetection();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tomato Companion</Text>
      <Text style={styles.subtitle}>
        Spike scaffold — cross-device sync lands in a later unit.
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
