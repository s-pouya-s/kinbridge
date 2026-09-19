import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const darkTheme = {
  bg: '#080F19',
  panel: '#121F33',
  panel2: '#17253C',
  stroke: '#28405F',
  ink: '#ECE7DA',
  inkDim: '#9FB0C4',
  inkFaint: '#5E7290',
  lineBlood: '#6FAE9F',
  lineMarriage: '#E0A63E',
  lineEnded: '#A6485A',
  accentCousin: '#DD8064',
  // The tapped-card highlight — a distinct green from lineBlood's teal above.
  selected: '#5CB86B',
  nodeFill: '#17253C',
  nodeStroke: '#3C577A',
  // Gender is optional on Person; these are only used when it's set.
  maleFill: '#152840',
  maleStroke: '#5C8FDB',
  femaleFill: '#2A1E30',
  femaleStroke: '#E08FB0',
};

/**
 * Same hues as darkTheme throughout (so "gold = marriage", "teal = blood
 * line", etc. still reads the same in either mode) — but every accent is
 * darkened/re-saturated for contrast against a light backdrop, since the
 * dark theme's pastel-on-navy accents would wash out on white.
 */
const lightTheme: typeof darkTheme = {
  bg: '#F5F2EA',
  panel: '#FFFFFF',
  panel2: '#EEEAE0',
  stroke: '#D9D2C0',
  ink: '#241F14',
  inkDim: '#5B5646',
  inkFaint: '#948C78',
  lineBlood: '#2F7A67',
  lineMarriage: '#A66A16',
  lineEnded: '#8C3346',
  accentCousin: '#B0522F',
  selected: '#2F8C48',
  nodeFill: '#EEEAE0',
  nodeStroke: '#B7AD94',
  maleFill: '#DCE7F7',
  maleStroke: '#2F5FA0',
  femaleFill: '#F6E1EC',
  femaleStroke: '#A83E71',
};

export type ThemeMode = 'dark' | 'light';
export type Theme = typeof darkTheme;

export const themes: Record<ThemeMode, Theme> = { dark: darkTheme, light: lightTheme };

const STORAGE_KEY = 'kinbridge:themeMode';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: Theme;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setMode(saved);
    });
  }, []);

  const toggleMode = () => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  const value = useMemo<ThemeContextValue>(() => ({ mode, theme: themes[mode], toggleMode }), [mode]);

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be called within a ThemeProvider');
  return ctx;
}
