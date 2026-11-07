/**
 * Which store this build is for, set at build time (EXPO_PUBLIC_APP_VARIANT,
 * see app.config.js and eas.json). Everything else is the same app, with the
 * same package name and signing key.
 *
 * - bazaar (the default): «تبارنامه», opens in Persian.
 * - play (Google Play): "Kin Bridge", opens in the phone's language when the
 *   app speaks it, else English, and shows "Kin Bridge" as its title in
 *   every language.
 */
export type AppVariant = 'bazaar' | 'play';

export const APP_VARIANT: AppVariant = process.env.EXPO_PUBLIC_APP_VARIANT === 'play' ? 'play' : 'bazaar';

/** The Google Play version's name: never translated, it's the brand. */
export const PLAY_APP_NAME = 'Kin Bridge';
