/**
 * Two store versions from one app.json, picked by EXPO_PUBLIC_APP_VARIANT
 * at build time (eas.json's *-play profiles set it; see
 * src/config/variant.ts for what the app itself does with it):
 *
 * - bazaar (the default): «تبارنامه», opens in Persian.
 * - play (Google Play): "Kin Bridge", opens in the phone's language if the
 *   app speaks it, else English.
 *
 * Same package name, signing key, icon and everything else.
 */
module.exports = ({ config }) => {
  const variant = process.env.EXPO_PUBLIC_APP_VARIANT === 'play' ? 'play' : 'bazaar';
  // The pipeline sets ANDROID_VERSION_CODE (always higher than the last
  // upload) so every build can go straight to a store; other builds keep
  // app.json's.
  const versionCode = process.env.ANDROID_VERSION_CODE ? Number(process.env.ANDROID_VERSION_CODE) : config.android?.versionCode;
  return {
    ...config,
    name: variant === 'play' ? 'Kin Bridge' : config.name,
    android: { ...config.android, versionCode },
    extra: { ...config.extra, appVariant: variant },
  };
};
