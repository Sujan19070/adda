import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

// Persistent banner shown across the app whenever global anonymous mode is on.
// Reads anonMode from the theme context, so dropping it at the top of a screen
// is all that's needed. Tapping "Turn off" flips the global toggle.
export default function AnonBanner() {
  const { colors, anonMode, toggleAnon } = useTheme();
  if (!anonMode) return null;
  return (
    <View style={[styles.bar, { backgroundColor: colors.jaamDark }]}>
      <Ionicons name="eye-off" size={15} color="#fff" />
      <Text style={styles.text}>Anonymous mode is ON</Text>
      <TouchableOpacity onPress={toggleAnon}>
        <Text style={styles.off}>Turn off</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },
  off: { color: '#fff', fontSize: 12.5, fontWeight: '800', textDecorationLine: 'underline' },
});
