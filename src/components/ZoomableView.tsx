import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { Theme } from '../theme';
import { clamp, clampAxis } from '../utils/camera';

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
/** Never blows a small chart up past this on the first fit; pinch to go further. */
const MAX_FIT_SCALE = 1.3;
/** Room kept around the content when it's fitted to the screen. */
const FIT_MARGIN = 24;

interface Props {
  contentWidth: number;
  contentHeight: number;
  /** Whenever this changes, the view re-fits (e.g. a different route was chosen). */
  fitKey: string;
  resetLabel: string;
  isRTL: boolean;
  theme: Theme;
  children: React.ReactNode;
}

/**
 * Pinch to zoom and drag to move around a fixed-size piece of content, with
 * a ↻ button that fits it back on screen. The same camera as the main tree
 * (see TreeCanvas): pan and pinch each apply small per-frame changes so they
 * never fight, and clampAxis keeps the content from being dragged away.
 * Must sit inside a GestureHandlerRootView, which a Modal needs its own of.
 */
export function ZoomableView({ contentWidth, contentHeight, fitKey, resetLabel, isRTL, theme, children }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const lastPinchScale = useSharedValue(1);

  const fit = () => {
    const { width: vw, height: vh } = viewport;
    if (vw === 0 || vh === 0) return;
    const s = clamp(Math.min((vw - FIT_MARGIN * 2) / contentWidth, (vh - FIT_MARGIN * 2) / contentHeight), MIN_SCALE, MAX_FIT_SCALE);
    scale.value = s;
    translateX.value = (vw - contentWidth * s) / 2;
    translateY.value = (vh - contentHeight * s) / 2;
  };

  useEffect(fit, [viewport.width, viewport.height, fitKey, contentWidth, contentHeight]);

  const vw = viewport.width;
  const vh = viewport.height;
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onChange((e) => {
      translateX.value = clampAxis(translateX.value + e.changeX, contentWidth, vw, scale.value);
      translateY.value = clampAxis(translateY.value + e.changeY, contentHeight, vh, scale.value);
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      lastPinchScale.value = 1;
    })
    .onUpdate((e) => {
      const factor = e.scale / lastPinchScale.value;
      lastPinchScale.value = e.scale;
      const next = clamp(scale.value * factor, MIN_SCALE, MAX_SCALE);
      const applied = next / scale.value;
      translateX.value = clampAxis(e.focalX - (e.focalX - translateX.value) * applied, contentWidth, vw, next);
      translateY.value = clampAxis(e.focalY - (e.focalY - translateY.value) * applied, contentHeight, vh, next);
      scale.value = next;
    });

  // Same top-left-pivot transform as TreeCanvas's contentStyle; see there.
  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value - contentWidth / 2 },
      { translateY: translateY.value - contentHeight / 2 },
      { scale: scale.value },
      { translateX: contentWidth / 2 },
      { translateY: contentHeight / 2 },
    ],
  }));

  return (
    <View style={styles.fill} onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
        <View style={styles.fill}>
          <Animated.View style={[styles.content, { width: contentWidth, height: contentHeight }, contentStyle]}>{children}</Animated.View>
        </View>
      </GestureDetector>
      <Pressable
        style={({ pressed }) => [styles.reset, isRTL ? { left: 16 } : { right: 16 }, pressed && { opacity: 0.55 }]}
        onPress={fit}
        accessibilityLabel={resetLabel}
        hitSlop={6}
      >
        <Text style={styles.resetText}>↻</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1, overflow: 'hidden' },
    content: { position: 'absolute', top: 0, left: 0 },
    reset: {
      position: 'absolute',
      bottom: 16,
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.panel2,
      borderWidth: 1,
      borderColor: theme.stroke,
      boxShadow: `0px 2px 6px ${theme.cardShadow}`,
    },
    resetText: { color: theme.ink, fontSize: 24, fontWeight: '700', lineHeight: 28 },
  });
}
