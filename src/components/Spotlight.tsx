import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/** One pulse of the ring; it pulses PULSES times, then the caller removes it. */
const PULSE_MS = 650;
const PULSES = 3;

/**
 * Draws attention to a card just found with the search button: a ring in
 * the selection color that grows out from the card and fades, three times
 * (about 2 seconds), then calls onDone. Drawn in the tree's own coordinates
 * (inside the zoomed content), so it stays on the card if the tree moves.
 * Never takes touches. Uses React Native's own Animated with the native
 * driver, like the opening screen, so nothing new is needed.
 */
export function Spotlight({ x, y, width, height, color, onDone }: { x: number; y: number; width: number; height: number; color: string; onDone: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }), { iterations: PULSES });
    run.start(({ finished }) => finished && onDone());
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ring a little bigger than the card, its line thick enough to see when zoomed out.
  const pad = Math.max(width, height) * 0.1;
  const ring = Math.max(width, height) * 0.1;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - width / 2 - pad,
        top: y - height / 2 - pad,
        width: width + pad * 2,
        height: height + pad * 2,
        borderRadius: (Math.min(width, height) + pad * 2) * 0.2,
        borderWidth: ring,
        borderColor: color,
        opacity: pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }}
    />
  );
}
