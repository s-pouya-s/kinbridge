const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * @iabtcf/core (a transitive dependency of react-native-google-mobile-ads,
 * used for GDPR/TCF consent signals) ships an ESM build whose own internal
 * relative imports use explicit ".js" extensions — Metro's package-exports
 * resolver doesn't fully implement Node's "fully specified" ESM extension
 * rules, so it fails to resolve those files even though they exist on disk.
 * Forcing this one package to resolve through the "require" condition sends
 * it down the CJS build instead, whose plain `require()` calls resolve via
 * Metro's ordinary (non-ESM-strict) resolution and work fine.
 */
const { resolveRequest: defaultResolveRequest } = config.resolver;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@iabtcf/core' || moduleName.startsWith('@iabtcf/core/')) {
    return context.resolveRequest({ ...context, unstable_conditionNames: ['require'] }, moduleName, platform);
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
