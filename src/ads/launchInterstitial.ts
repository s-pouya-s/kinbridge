import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Expo Go has no native TurboModules compiled in for this package at all —
 * calling `require('react-native-google-mobile-ads')` there doesn't just
 * fail quietly, Metro's dev-mode module loader reports the throw to LogBox
 * as a red-screen error the moment the module is first evaluated, no matter
 * what try/catch is wrapped around the require() call downstream. The only
 * way to avoid that red screen is to never require the module in the first
 * place under Expo Go. `appOwnership` is deprecated in favor of
 * `executionEnvironment`, but that replacement lumps Expo Go together with
 * an `expo-dev-client` build under the same `StoreClient` value — exactly
 * the two cases that need to be told apart here, since a dev-client build
 * (like the one this app now ships, for the ad module itself) *does* have
 * the native module linked. `appOwnership === 'expo'` is still the only
 * value that means "Expo Go specifically."
 */
const isExpoGo = Constants.appOwnership === 'expo';

/** The real AdMob interstitial ad unit — only used outside __DEV__, where TestIds.INTERSTITIAL is used instead. */
const PROD_AD_UNIT_ID = 'ca-app-pub-4666171217554833/7228771178';

/**
 * Shows one interstitial ad the first time the app launches in this process,
 * then calls `onDone`. Never fires again until the app is fully relaunched —
 * there's no persisted "seen today" flag, because the in-memory `shown` ref
 * already resets on every cold start, which is exactly the "until next app
 * open" rule this is for.
 *
 * `react-native-google-mobile-ads` has no web implementation and isn't
 * supported in Expo Go (custom native module) — both are guarded against
 * here so importing this file never breaks the web build or a plain Expo Go
 * session; on those, `onDone` just isn't called and the app opens normally.
 */
export function useLaunchInterstitialAd(onDone: () => void) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const startedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo || startedRef.current) return;
    startedRef.current = true;

    // Defense in depth for anything else unexpected (a bad build, a future
    // Expo Go behavior change) — everything from require() through the
    // first native call is still wrapped in one try/catch; any of them
    // throwing just means "no ads here," not a crash.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: mobileAds, InterstitialAd, AdEventType, TestIds } = require('react-native-google-mobile-ads');

      const adUnitId = __DEV__ ? TestIds.INTERSTITIAL : PROD_AD_UNIT_ID;
      const interstitial = InterstitialAd.createForAdRequest(adUnitId);

      const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        interstitial.show();
      });
      // Only the actual "watched and closed the ad" path says thanks — a load
      // failure (offline, no fill) just lets the user in without any popup,
      // rather than thanking them for something they never saw.
      const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        onDoneRef.current();
      });
      const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, () => {});

      mobileAds()
        .initialize()
        .then(() => interstitial.load())
        .catch(() => {});

      return () => {
        unsubscribeLoaded();
        unsubscribeClosed();
        unsubscribeError();
      };
    } catch {
      return;
    }
  }, []);
}
