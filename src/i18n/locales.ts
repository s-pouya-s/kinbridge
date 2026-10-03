/**
 * Every language the app speaks. Pure (no React), so the layout scripts and
 * the PDF can use it too.
 */
export type Locale = 'fa' | 'en' | 'ar' | 'de' | 'fr' | 'it' | 'es' | 'pt' | 'ru' | 'tr' | 'zh' | 'ko' | 'ja' | 'hi' | 'id' | 'ur';

export interface LocaleInfo {
  code: Locale;
  /** The language's name in itself, never translated, so someone who can't read the current language can still find their own. */
  nativeName: string;
  rtl: boolean;
  /** The digits this language writes numbers with. */
  digits: 'latin' | 'persian' | 'arabic';
}

/** In the order the language list shows them. */
export const LOCALES: LocaleInfo[] = [
  { code: 'fa', nativeName: 'فارسی', rtl: true, digits: 'persian' },
  { code: 'en', nativeName: 'English', rtl: false, digits: 'latin' },
  { code: 'ar', nativeName: 'العربية', rtl: true, digits: 'arabic' },
  { code: 'de', nativeName: 'Deutsch', rtl: false, digits: 'latin' },
  { code: 'fr', nativeName: 'Français', rtl: false, digits: 'latin' },
  { code: 'it', nativeName: 'Italiano', rtl: false, digits: 'latin' },
  { code: 'es', nativeName: 'Español', rtl: false, digits: 'latin' },
  { code: 'pt', nativeName: 'Português', rtl: false, digits: 'latin' },
  { code: 'ru', nativeName: 'Русский', rtl: false, digits: 'latin' },
  { code: 'tr', nativeName: 'Türkçe', rtl: false, digits: 'latin' },
  { code: 'zh', nativeName: '简体中文', rtl: false, digits: 'latin' },
  { code: 'ko', nativeName: '한국어', rtl: false, digits: 'latin' },
  { code: 'ja', nativeName: '日本語', rtl: false, digits: 'latin' },
  { code: 'hi', nativeName: 'हिन्दी', rtl: false, digits: 'latin' },
  { code: 'id', nativeName: 'Bahasa Indonesia', rtl: false, digits: 'latin' },
  { code: 'ur', nativeName: 'اردو', rtl: true, digits: 'latin' },
];

export const LOCALE_CODES = LOCALES.map((l) => l.code);

export function localeInfo(locale: Locale): LocaleInfo {
  return LOCALES.find((l) => l.code === locale) ?? LOCALES[1];
}

/** A supported locale for a language tag like "de-AT" or "zh-Hans-CN", or undefined. */
export function matchLocale(tag: string | undefined | null): Locale | undefined {
  const code = tag?.toLowerCase().split(/[-_]/)[0];
  return LOCALE_CODES.find((c) => c === code);
}

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

/** `value` with its digits written the way `locale` writes them. */
export function localDigits(value: string | number, locale: Locale): string {
  const set = localeInfo(locale).digits;
  if (set === 'latin') return String(value);
  const table = set === 'persian' ? PERSIAN : ARABIC;
  return String(value).replace(/[0-9]/g, (d) => table[Number(d)]);
}

/** Back to 0-9 from any digits this app writes. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ARABIC.indexOf(d)));
}

/** Matches any digits this app writes (Latin, Persian or Arabic). */
export const ANY_DIGITS = '[0-9۰-۹٠-٩]';
