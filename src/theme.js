// Adda design tokens + live day/night mode.
// Screens call useTheme() for { colors, isDark, toggle } and build their
// styles via a makeStyles(colors) factory, so flipping the switch in the
// Profile tab re-skins the entire app instantly. The choice is saved to
// the device and restored on next launch.

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const dark = {
  bg: '#140A10',
  card: '#1F1219',
  ink: '#FBEAF2',
  jaam: '#E75A93',
  jaamDark: '#C13D74',
  jaamSoft: '#341B28',
  shiuli: '#F2794B',
  gold: '#D9A662',
  muted: '#B99CAB',
  line: '#33202B',
  nope: '#8E7C88',
  active: '#4CC58F',
  away: '#6E5D78',
  overlay: 'rgba(8, 3, 6, 0.94)',
  pill: 'rgba(12, 5, 9, 0.72)',
  pillText: '#FBEAF2',
  danger: '#FF7A6B',
};

const light = {
  bg: '#FFF6F4',
  card: '#FFFFFF',
  ink: '#3A1E2E',
  jaam: '#A8336E',
  jaamDark: '#7C2352',
  jaamSoft: '#FBE9F2',
  shiuli: '#F2794B',
  gold: '#D9A662',
  muted: '#A98D9C',
  line: '#F6E4E8',
  nope: '#6B5E68',
  active: '#3FA579',
  away: '#C3B4CE',
  overlay: 'rgba(58, 30, 46, 0.93)',
  pill: 'rgba(255, 255, 255, 0.92)',
  pillText: '#3A1E2E',
  danger: '#B3261E',
};

export const fonts = {
  display: 'Fraunces_700Bold',
  displayMedium: 'Fraunces_600SemiBold',
};

const STORAGE_KEY = 'adda-theme';

const ThemeContext = createContext({
  colors: dark,
  isDark: true,
  toggle: () => {},
  anonMode: false,
  toggleAnon: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');
  const [anonMode, setAnonMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => (v === 'light' || v === 'dark') && setMode(v))
      .catch(() => {});
    AsyncStorage.getItem('adda-anon')
      .then((v) => setAnonMode(v === '1'))
      .catch(() => {});
  }, []);

  const toggleAnon = () =>
    setAnonMode((a) => {
      const next = !a;
      AsyncStorage.setItem('adda-anon', next ? '1' : '0').catch(() => {});
      return next;
    });

  const toggle = () =>
    setMode((m) => {
      const next = m === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });

  return (
    <ThemeContext.Provider
      value={{
        colors: mode === 'dark' ? dark : light,
        isDark: mode === 'dark',
        toggle,
        anonMode,
        toggleAnon,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
