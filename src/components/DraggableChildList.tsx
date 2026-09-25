import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ID } from '../types';
import type { Theme } from '../theme';

const ROW_HEIGHT = 48;
const ROW_GAP = 8;
const STEP = ROW_HEIGHT + ROW_GAP;

interface Item {
  id: ID;
  label: string;
}

interface Props {
  /** Already in sibling order, oldest first. */
  items: Item[];
  /** Called once per drag, when it's dropped somewhere new, with every id in the new order. */
  onReorder: (ids: ID[]) => void;
  onRemove: (id: ID) => void;
  removeLabel: string;
  dragLabel: string;
  isRTL: boolean;
  theme: Theme;
}

/**
 * A marriage's children as a drag-to-reorder list: hold a row's ≡ handle
 * and drag it up or down; the other rows slide aside to make room, and
 * letting go saves the new order. Only the handle starts a drag, so the
 * sheet around it still scrolls normally from anywhere else.
 *
 * Every row is absolutely positioned at slot * STEP. `slots` maps each id to
 * its current slot and is updated live as a row is dragged past its
 * neighbors (they animate to their new slot); the dragged row itself just
 * follows the finger, then slides into its final slot on release.
 *
 * Must sit inside a GestureHandlerRootView: on Android a Modal's content is
 * outside the app's own root view, so gestures in it need their own.
 */
export function DraggableChildList({ items, onReorder, onRemove, removeLabel, dragLabel, isRTL, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const slots = useSharedValue<Record<ID, number>>(slotsOf(items));
  const orderKey = items.map((i) => i.id).join('|');

  // A new order from outside (a drop that was saved, a child added or
  // removed) becomes the new resting layout.
  useEffect(() => {
    slots.value = slotsOf(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  return (
    <View style={{ height: items.length * STEP }}>
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          count={items.length}
          slots={slots}
          onDrop={onReorder}
          onRemove={onRemove}
          removeLabel={removeLabel}
          dragLabel={dragLabel}
          isRTL={isRTL}
          styles={styles}
        />
      ))}
    </View>
  );
}

function slotsOf(items: Item[]): Record<ID, number> {
  return Object.fromEntries(items.map((item, i) => [item.id, i]));
}

function Row({
  item,
  count,
  slots,
  onDrop,
  onRemove,
  removeLabel,
  dragLabel,
  isRTL,
  styles,
}: {
  item: Item;
  count: number;
  slots: SharedValue<Record<ID, number>>;
  onDrop: (ids: ID[]) => void;
  onRemove: (id: ID) => void;
  removeLabel: string;
  dragLabel: string;
  isRTL: boolean;
  styles: Styles;
}) {
  const dragging = useSharedValue(false);
  const dragTop = useSharedValue(0);
  const startSlot = useSharedValue(0);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      dragging.value = true;
      startSlot.value = slots.value[item.id];
      dragTop.value = startSlot.value * STEP;
    })
    .onUpdate((e) => {
      const top = Math.max(0, Math.min((count - 1) * STEP, startSlot.value * STEP + e.translationY));
      dragTop.value = top;
      const from = slots.value[item.id];
      const to = Math.round(top / STEP);
      if (to !== from) {
        // Swap with whoever holds that slot now; they slide into ours.
        const next = { ...slots.value };
        for (const id in next) if (next[id] === to) next[id] = from;
        next[item.id] = to;
        slots.value = next;
      }
    })
    .onFinalize(() => {
      if (!dragging.value) return;
      dragging.value = false;
      if (slots.value[item.id] !== startSlot.value) {
        const ordered = Object.keys(slots.value).sort((a, b) => slots.value[a] - slots.value[b]);
        scheduleOnRN(onDrop, ordered);
      }
    });

  const rowStyle = useAnimatedStyle(() => {
    const restingTop = slots.value[item.id] * STEP;
    return {
      top: dragging.value ? dragTop.value : withTiming(restingTop, { duration: 160 }),
      zIndex: dragging.value ? 10 : 0,
      transform: [{ scale: withTiming(dragging.value ? 1.03 : 1, { duration: 120 }) }],
      opacity: dragging.value ? 0.92 : 1,
    };
  });

  return (
    <Animated.View style={[styles.row, isRTL && styles.rowRTL, rowStyle]}>
      <GestureDetector gesture={pan}>
        <View style={styles.handle} accessibilityLabel={dragLabel} hitSlop={8}>
          <View style={styles.handleBar} />
          <View style={styles.handleBar} />
          <View style={styles.handleBar} />
        </View>
      </GestureDetector>
      <Text style={[styles.name, isRTL && styles.textRTL]} numberOfLines={1}>
        {item.label}
      </Text>
      <Pressable onPress={() => onRemove(item.id)} hitSlop={6}>
        <Text style={styles.remove}>{removeLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.panel2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.stroke,
      paddingHorizontal: 12,
    },
    rowRTL: { flexDirection: 'row-reverse' },
    handle: { width: 28, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4 },
    handleBar: { width: 18, height: 2, borderRadius: 1, backgroundColor: theme.inkFaint },
    name: { flex: 1, color: theme.ink, fontSize: 14 },
    textRTL: { textAlign: 'right', writingDirection: 'rtl' },
    remove: { color: theme.lineEnded, fontSize: 12.5, fontWeight: '600' },
  });
}
