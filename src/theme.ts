import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const darkTheme = {
  // A soft charcoal rather than near-black navy, with every panel and
  // border in the same gray family so nothing reads as leftover blue.
  bg: '#1A1D23',
  // A touch darker than bg: the empty space around the tree in the overview map.
  minimapBg: '#15181D',
  // Laid over the parts of the overview map that are off screen.
  minimapDim: 'rgba(0,0,0,0.45)',
  // The drop shadow under each card on the tree.
  cardShadow: 'rgba(0,0,0,0.55)',
  panel: '#23272F',
  panel2: '#2B3039',
  stroke: '#3F4652',
  ink: '#ECE7DA',
  inkDim: '#9FB0C4',
  inkFaint: '#6F7C8F',
  lineBlood: '#6FAE9F',
  lineMarriage: '#E0A63E',
  lineEnded: '#A6485A',
  accentCousin: '#DD8064',
  // The tapped-card highlight — a distinct green from lineBlood's teal above.
  selected: '#5CB86B',
  // The whole card's fill while it's selected: a deep green the light name text still reads on.
  selectedFill: '#1E4A2B',
  // The mourning ribbon stays black; on dark cards only a bright outline makes it show.
  ribbonEdge: 'rgba(255,255,255,0.85)',
  // Card fills sit clearly above bg (about 1.7 to 2 times its contrast; the
  // first ones were barely 1.25 and read as the same navy) while the light
  // name text keeps 6.5 to 8 times against them. Neutral is a plain warm gray, not a
  // navy, so it can't be mistaken for a man's blue card.
  nodeFill: '#4A505B',
  nodeStroke: '#B0B7C3',
  // Gender is optional on Person; these are only used when it's set.
  maleFill: '#1F4379',
  maleStroke: '#6FA6F5',
  femaleFill: '#6B2E57',
  femaleStroke: '#F29BC6',
};

/**
 * Same hues as darkTheme throughout (so "gold = marriage", "teal = blood
 * line", etc. still reads the same in either mode) — but every accent is
 * darkened/re-saturated for contrast against a light backdrop, since the
 * dark theme's pastel-on-navy accents would wash out on white.
 */
const lightTheme: typeof darkTheme = {
  bg: '#F5F2EA',
  minimapBg: '#ECE7DC',
  minimapDim: 'rgba(60,48,20,0.16)',
  cardShadow: 'rgba(60,45,15,0.22)',
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
  selectedFill: '#CDEBD3',
  ribbonEdge: 'rgba(255,255,255,0.5)',
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
