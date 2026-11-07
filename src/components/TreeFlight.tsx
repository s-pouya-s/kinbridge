import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Flight {
  /** Changes on every flight, so a new pick restarts the animation. */
  id: number;
  name: string;
  /** The picked row in the trees list, in this overlay's own coordinates. */
  from: Rect;
  /** The tree name in the header. */
  to: Rect;
}

/** How long the name takes to fly up. The owner's choice: 0.6 seconds, every time. */
export const FLIGHT_MS = 600;
const GLOW_MS = 420;

/**
 * After a tree is picked in the trees list, its name flies from the row up
 * into the header title, and the title glows once on landing. It shows
 * people where to tap to choose a tree again. Never takes touches.
 */
export function TreeFlight({ flight, onDone }: { flight: Flight | null; onDone: () => void }) {
  const { theme } = useTheme();
  const { isRTL } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const progress = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!flight) return;
    progress.setValue(0);
    glow.setValue(0);
    const run = Animated.parallel([
      Animated.timing(progress, { toValue: 1, duration: FLIGHT_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(FLIGHT_MS - 160),
        Animated.timing(glow, { toValue: 1, duration: GLOW_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]);
    run.start(({ finished }) => finished && onDone());
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.id]);

  if (!flight) return null;
  const { from, to } = flight;
  // Move the row's center onto the title's center, shrinking to the title's height.
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const endScale = Math.max(0.35, Math.min(1, to.height / from.height));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.chip,
          { left: from.x, top: from.y, width: from.width, height: from.height },
          {
            opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, endScale] }) },
            ],
          },
        ]}
      >
        <Text style={[styles.name, isRTL && styles.rtl]} numberOfLines={1}>
          {flight.name}
        </Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { left: to.x - 10, top: to.y - 6, width: to.width + 20, height: to.height + 12 },
          {
            opacity: glow.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] }) }],
          },
        ]}
      />
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    chip: {
      position: 'absolute',
      justifyContent: 'center',
      paddingHorizontal: 14,
      backgroundColor: theme.panel2,
      borderColor: theme.lineMarriage,
      borderWidth: 1.5,
      borderRadius: 12,
      zIndex: 900,
      elevation: 12,
    },
    name: { color: theme.ink, fontSize: 15, fontWeight: '700' },
    rtl: { textAlign: 'right', writingDirection: 'rtl' },
    glow: {
      position: 'absolute',
      borderColor: theme.lineMarriage,
      borderWidth: 2.5,
      borderRadius: 14,
      zIndex: 901,
      elevation: 13,
    },
  });
}
