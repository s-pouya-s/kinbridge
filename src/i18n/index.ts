import React, { createContext, useContext, useMemo, useState } from 'react';
import { en, type StringKey } from './en';
import { fa } from './fa';

export type Locale = 'en' | 'fa';

const catalogs: Record<Locale, Record<StringKey, string>> = { en, fa };

/** Right-to-left is a property of the locale, not a separate setting. */
export const RTL_LOCALES: Locale[] = ['fa'];

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

export function I18nProvider({ children, initialLocale = 'fa' }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const value = useMemo<I18nContextValue>(() => {
    const catalog = catalogs[locale];
    return {
      locale,
      isRTL: RTL_LOCALES.includes(locale),
      t: (key, vars) => interpolate(catalog[key], vars),
      setLocale,
    };
  }, [locale]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n() must be called within an I18nProvider');
  return ctx;
}

/** "1st"/"اول" etc. for 1-10, a generic "{n}th"/"{n}اُم" pattern beyond that. */
export function formatOrdinal(t: TFunction, n: number): string {
  if (n >= 1 && n <= 10) return t(`ordinal${n}` as StringKey);
  return t('ordinalOther', { n });
}
