import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { tomatoTheme } from './src/theme/tomatoTheme';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tomato Companion</Text>
      <Text style={styles.subtitle}>
        Spike scaffold — pickup detection lands in a later unit.
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
});
