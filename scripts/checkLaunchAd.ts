/**
 * Drives the launch ad (src/ads/launchAd.ts) with a fake ad module through
 * every way a real ad can go, and checks the thank-you runs only when the
 * ad was actually seen and closed.
 */
import { startLaunchAd, type AdsModule } from '../src/ads/launchAd';

type Script = { loadAfterMs?: number; fail?: 'load' | 'show'; openThenClose?: boolean };

function fakeAds(script: Script, log: string[]): AdsModule {
  return {
    default: () => ({ initialize: () => Promise.resolve() }),
    TestIds: { INTERSTITIAL: 'test' },
    AdEventType: { LOADED: 'loaded', OPENED: 'opened', CLOSED: 'closed', ERROR: 'error' },
    InterstitialAd: {
      createForAdRequest: () => {
        const listeners: Record<string, ((p?: unknown) => void)[]> = {};
        const emit = (type: string) => (listeners[type] ?? []).forEach((l) => l());
        return {
          addAdEventListener: (type, listener) => {
            (listeners[type] ??= []).push(listener);
            return () => (listeners[type] = listeners[type].filter((l) => l !== listener));
          },
          load: () => {
            log.push('load');
            setTimeout(() => emit(script.fail === 'load' ? 'error' : 'loaded'), script.loadAfterMs ?? 10);
          },
          show: () => {
            log.push('show');
            if (script.fail === 'show') return Promise.reject(new Error('cannot show'));
            if (script.openThenClose !== false) {
              setTimeout(() => emit('opened'), 5);
              setTimeout(() => emit('closed'), 20);
            }
            return Promise.resolve();
          },
        };
      },
    },
  };
}

async function run(name: string, script: Script, expectThanks: boolean, expectShown: boolean) {
  const log: string[] = [];
  let thanks = 0;
  startLaunchAd(fakeAds(script, log), 'test', () => thanks++);
  await new Promise((r) => setTimeout(r, 1500));
  const ok = (thanks === 1) === expectThanks && log.includes('show') === expectShown && thanks <= 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}: ${name} (shown: ${log.includes('show')}, thank-yous: ${thanks})`);
  return ok;
}

(async () => {
  const results = [
    await run('ad loads, is watched and closed: thank-you once', {}, true, true),
    await run('ad fails to load (offline, no fill): no ad, no thank-you', { fail: 'load' }, false, false),
    await run('ad loads slowly (while the app is in use): still shows, then thank-you', { loadAfterMs: 1000 }, true, true),
    await run('ad loads but fails to show: no thank-you', { fail: 'show' }, false, true),
  ];
  if (results.some((r) => !r)) process.exit(1);
})();
