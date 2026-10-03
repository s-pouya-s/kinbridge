/**
 * Which store this build is for, set at build time (EXPO_PUBLIC_APP_VARIANT,
 * see app.config.js and eas.json). Bazaar: «شجره نامه», opens in Persian.
 * Galaxy Store: "Family Tree", opens in the phone's language when the app
 * speaks it, else English. Everything else is the same app.
 */
export type AppVariant = 'bazaar' | 'galaxy';

export const APP_VARIANT: AppVariant = process.env.EXPO_PUBLIC_APP_VARIANT === 'galaxy' ? 'galaxy' : 'bazaar';
