/**
 * The launch ad's own logic, kept free of any React Native import so
 * scripts/checkLaunchAd.ts can run it with a fake ad module (see
 * launchInterstitial.ts for the hook that runs it in the app).
 */

/** The parts of react-native-google-mobile-ads this file uses; a fake of the same shape drives scripts/checkLaunchAd.ts. */
export interface AdsModule {
  default: () => { initialize: () => Promise<unknown> };
  InterstitialAd: {
    createForAdRequest: (adUnitId: string) => {
      addAdEventListener: (type: string, listener: (payload?: unknown) => void) => () => void;
      load: () => void;
      show: () => Promise<void>;
    };
  };
  AdEventType: { LOADED: string; OPENED: string; CLOSED: string; ERROR: string };
  TestIds: { INTERSTITIAL: string };
}

/**
 * Loads one interstitial in the background and shows it as soon as it's
 * ready, however long that takes: the app is fully usable in the meantime,
 * nobody waits on the ad. `onWatched` runs only on the "watched and closed
 * the ad" path; a load failure (offline, no fill) or a failure to show just
 * means no ad this launch, rather than a thank-you for an ad nobody saw.
 * Returns a cleanup that detaches every listener.
 */
export function startLaunchAd(ads: AdsModule, adUnitId: string, onWatched: () => void): () => void {
  const { default: mobileAds, InterstitialAd, AdEventType } = ads;
  const interstitial = InterstitialAd.createForAdRequest(adUnitId);
  let shown = false;

  const unsubscribes = [
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitial.show().catch(() => {});
    }),
    // The ad's own "it's on screen" event, not show()'s promise, marks it as
    // seen: the event is guaranteed to come before CLOSED.
    interstitial.addAdEventListener(AdEventType.OPENED, () => {
      shown = true;
    }),
    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      if (shown) onWatched();
    }),
    interstitial.addAdEventListener(AdEventType.ERROR, () => {}),
  ];

  mobileAds()
    .initialize()
    .then(() => interstitial.load())
    .catch(() => {});

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}
