import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/en';

// Same color and logo as the native splash in app.json, so the hand-off
// from the native splash to this one doesn't show a jump.
export const SPLASH_BACKGROUND = '#400C1F';
// A light copper, to go with the logo's lines.
const SPLASH_TEXT = '#F6DDBB';
const LOGO_SIZE = 220;
/** How long the logo and sentence stay before the app shows. */
const HOLD_MS = 2000;
const FADE_MS = 450;
/** One of these ten sentences shows, picked at random on each launch. */
const TAGLINES = Array.from({ length: 10 }, (_, i) => `splashTagline${i + 1}` as StringKey);

// Keep the native splash up until this screen is ready to take over.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * The opening screen: the logo and one sentence in the user's language for
 * two seconds (a different one of ten each launch), then it fades away over the app (which loads underneath in
 * the meantime). It waits for the saved language, so the sentence never
 * shows in the wrong language first.
 */
export function SplashIntro({ onStart, onFinish }: { onStart?: () => void; onFinish?: () => void }) {
  const { t, isRTL, ready } = useI18n();
  const [gone, setGone] = useState(false);
  const [tagline] = useState(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);
  const screen = useRef(new Animated.Value(1)).current;
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;

  // Tells the app this screen is up (also when it plays again, e.g. after a
  // live reload), so pop-ups like the trees list stay hidden under it.
  useEffect(() => {
    onStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(logo, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 800, delay: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.timing(screen, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
        setGone(true);
        onFinish?.();
      });
    }, HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, logo, text, screen]);

  if (gone) return null;

  return (
    <Animated.View style={[styles.screen, { opacity: screen }]}>
      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        style={[styles.logo, { opacity: logo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }), transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
      />
      {ready && (
        <Animated.Text
          style={[
            styles.tagline,
            isRTL && styles.rtl,
            { opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
          ]}
        >
          {t(tagline)}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    zIndex: 1000,
    elevation: 1000,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  tagline: {
    marginTop: 28,
    color: SPLASH_TEXT,
    fontSize: 20,
    lineHeight: 32,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  rtl: { writingDirection: 'rtl' },
});
