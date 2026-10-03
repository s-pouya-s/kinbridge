import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { en, type StringKey } from './en';
import { fa } from './fa';
import { ar } from './ar';
import { de } from './de';
import { fr } from './fr';
import { it } from './it';
import { es } from './es';
import { pt } from './pt';
import { ru } from './ru';
import { tr } from './tr';
import { zh } from './zh';
import { ko } from './ko';
import { ja } from './ja';
import { hi } from './hi';
import { id } from './id';
import { ur } from './ur';
import { LOCALES, matchLocale, type Locale } from './locales';
import { APP_VARIANT } from '../config/variant';

export type { Locale } from './locales';

/**
 * Every language's phrases. en.ts is the source of truth; every other file
 * is typed `Record<StringKey, string>`, so a missing phrase fails typecheck.
 * A phrase still missing at runtime falls back to English.
 */
const catalogs: Partial<Record<Locale, Record<StringKey, string>>> = { en, fa, ar, de, fr, it, es, pt, ru, tr, zh, ko, ja, hi, id, ur };

/** One phrase in every language the app has, e.g. every way "New person" has been written, to recognize a name made in any of them. */
export function phraseInEveryLanguage(key: StringKey): string[] {
  return [...new Set(Object.values(catalogs).map((c) => c![key]))];
}

/** Right-to-left is a property of the locale, not a separate setting. */
export const RTL_LOCALES: Locale[] = LOCALES.filter((l) => l.rtl).map((l) => l.code);

/** The languages the app actually has phrases for, in the language list's order. */
export const AVAILABLE_LOCALES = LOCALES.filter((l) => catalogs[l.code]);

/** The user's own pick, kept across launches. */
const LOCALE_KEY = 'kinbridge:locale:v1';

/**
 * Where a fresh install starts: Persian for Bazaar; for Galaxy Store the
 * phone's language when the app speaks it, else English.
 */
export function defaultLocale(): Locale {
  if (APP_VARIANT === 'bazaar') return 'fa';
  try {
    for (const l of getLocales()) {
      const match = matchLocale(l.languageTag);
      if (match && catalogs[match]) return match;
    }
  } catch {
    // No locale info: English.
  }
  return 'en';
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export type TFunction = (key: StringKey, vars?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  isRTL: boolean;
  t: TFunction;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initialLocale = defaultLocale() }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // A language the user picked before wins over the default.
  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY)
      .then((saved) => {
        const match = matchLocale(saved);
        if (match && catalogs[match]) setLocaleState(match);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const catalog = catalogs[locale] ?? en;
    return {
      locale,
      isRTL: RTL_LOCALES.includes(locale),
      t: (key, vars) => interpolate(catalog[key] ?? en[key], vars),
      setLocale: (next) => {
        setLocaleState(next);
        AsyncStorage.setItem(LOCALE_KEY, next).catch(() => {});
      },
    };
  }, [locale]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n() must be called within an I18nProvider');
  return ctx;
}
