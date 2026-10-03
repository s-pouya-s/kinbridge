/**
 * Two store versions from one app.json, picked by EXPO_PUBLIC_APP_VARIANT
 * at build time (eas.json's *-galaxy profiles set it; see
 * src/config/variant.ts for what the app itself does with it):
 *
 * - bazaar (the default): «شجره نامه», opens in Persian.
 * - galaxy: "Family Tree", opens in the phone's language if the app speaks
 *   it, else English.
 *
 * Same package name, icon and everything else.
 */
module.exports = ({ config }) => {
  const variant = process.env.EXPO_PUBLIC_APP_VARIANT === 'galaxy' ? 'galaxy' : 'bazaar';
  // The pipeline sets ANDROID_VERSION_CODE (always higher than the last
  // upload) so every build can go straight to a store; other builds keep
  // app.json's.
  const versionCode = process.env.ANDROID_VERSION_CODE ? Number(process.env.ANDROID_VERSION_CODE) : config.android?.versionCode;
  return {
    ...config,
    name: variant === 'galaxy' ? 'Family Tree' : config.name,
    android: { ...config.android, versionCode },
    extra: { ...config.extra, appVariant: variant },
  };
};
