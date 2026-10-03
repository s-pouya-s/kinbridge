import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ID } from '../types';
import type { Theme } from '../theme';
import { orderAfterDrag, topsOf } from '../utils/dragOrder';

const ROW_HEIGHT = 48;
const ROW_GAP = 8;
const STEP = ROW_HEIGHT + ROW_GAP;
/** The tinted box around a group born together reaches this far past its rows. */
const GROUP_PAD = 4;
const LINK_SIZE = 26;

interface Item {
  id: ID;
  label: string;
}

interface Props {
  /** Already in sibling order, oldest first. */
  items: Item[];
  /** Groups of children born together (see groupsOf); each sits side by side in `items`. */
  bornTogether: ID[][];
  /** The link button between two neighboring children: links them as born together, or unlinks them. */
  onToggleBornTogether: (aId: ID, bId: ID) => void;
  bornTogetherLabel: string;
  /** Called once per drag, when it's dropped somewhere new, with every id in the new order. */
  onReorder: (ids: ID[]) => void;
  onRemove: (id: ID) => void;
  removeLabel: string;
  dragLabel: string;
  isRTL: boolean;
  theme: Theme;
}

/** What moves as one when dragged: a single child, or a whole group born together. */
interface Block {
  key: ID;
  items: Item[];
  group: boolean;
}

function blocksOf(items: Item[], groups: ID[][]): Block[] {
  const groupOf = new Map<ID, ID[]>();
  for (const g of groups) for (const id of g) groupOf.set(id, g);
  const blocks: Block[] = [];
  for (const item of items) {
    const group = groupOf.get(item.id);
    const last = blocks[blocks.length - 1];
    if (group && last?.group && group.includes(last.items[0].id)) last.items.push(item);
    else blocks.push({ key: item.id, items: [item], group: !!group });
  }
  return blocks;
}

/**
 * A marriage's children as a drag-to-reorder list: hold a row's ≡ handle
 * and drag it up or down; the others slide aside to make room, and letting
 * go saves the new order. Only the handle starts a drag, so the sheet
 * around it still scrolls normally from anywhere else.
 *
 * Children born together are one block: they sit in one tinted box (like
 * the language list in the side menu), dragging any of them moves the whole
 * group, and nothing can be dropped between them. `order` holds the blocks'
 * order and is updated live as a block is dragged past its neighbors (they
 * animate to their new place); the dragged block follows the finger, then
 * slides into place on release.
 *
 * Between every two neighbors sits a link button: it links them as born
 * together, or unlinks them. The buttons hide while a block is dragged.
 *
 * Must sit inside a GestureHandlerRootView: on Android a Modal's content is
 * outside the app's own root view, so gestures in it need their own.
 */
export function DraggableChildList({ items, bornTogether, onToggleBornTogether, bornTogetherLabel, onReorder, onRemove, removeLabel, dragLabel, isRTL, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const blocks = useMemo(() => blocksOf(items, bornTogether), [items, bornTogether]);
  const heights = Object.fromEntries(blocks.map((b) => [b.key, b.items.length * STEP]));
  const idsOf = Object.fromEntries(blocks.map((b) => [b.key, b.items.map((i) => i.id)]));
  const order = useSharedValue<string[]>(blocks.map((b) => b.key));
  const anyDragging = useSharedValue(false);
  const layoutKey = blocks.map((b) => b.items.map((i) => i.id).join(',')).join('|');

  // A new order or grouping from outside (a drop that was saved, a child
  // added or removed, a link toggled) becomes the new resting layout.
  useEffect(() => {
    order.value = blocks.map((b) => b.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  const linksStyle = useAnimatedStyle(() => ({ opacity: anyDragging.value ? 0 : 1 }));
  const linked = (a: ID, b: ID) => bornTogether.some((g) => g.includes(a) && g.includes(b));

  return (
    <View style={{ height: items.length * STEP }}>
      {blocks.map((block) => (
        <BlockView
          key={block.key}
          block={block}
          heights={heights}
          idsOf={idsOf}
          total={items.length * STEP}
          order={order}
          anyDragging={anyDragging}
          onDrop={onReorder}
          onRemove={onRemove}
          removeLabel={removeLabel}
          dragLabel={dragLabel}
          isRTL={isRTL}
          styles={styles}
        />
      ))}
      {/* Between every two neighbors: link them as born together, or unlink. */}
      <Animated.View style={[StyleSheet.absoluteFill, linksStyle]} pointerEvents="box-none">
        {items.slice(1).map((item, i) => {
          const prev = items[i];
          const on = linked(prev.id, item.id);
          return (
            <Pressable
              key={`link${prev.id}`}
              onPress={() => onToggleBornTogether(prev.id, item.id)}
              hitSlop={6}
              accessibilityLabel={bornTogetherLabel}
              accessibilityState={{ selected: on }}
              style={[styles.link, on && styles.linkOn, { top: (i + 1) * STEP - ROW_GAP / 2 - LINK_SIZE / 2 }]}
            >
              <Text style={[styles.linkIcon, !on && styles.linkIconOff]}>🔗</Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

function BlockView({
  block,
  heights,
  idsOf,
  total,
  order,
  anyDragging,
  onDrop,
  onRemove,
  removeLabel,
  dragLabel,
  isRTL,
  styles,
}: {
  block: Block;
  heights: Record<string, number>;
  idsOf: Record<string, ID[]>;
  total: number;
  order: SharedValue<string[]>;
  anyDragging: SharedValue<boolean>;
  onDrop: (ids: ID[]) => void;
  onRemove: (id: ID) => void;
  removeLabel: string;
  dragLabel: string;
  isRTL: boolean;
  styles: Styles;
}) {
  const dragging = useSharedValue(false);
  const dragTop = useSharedValue(0);
  const startTop = useSharedValue(0);
  const startOrder = useSharedValue<string[]>([]);
  const height = heights[block.key];

  // One per handle (a gesture object can only sit on one detector); all of
  // them drag this whole block.
  const makePan = () =>
    Gesture.Pan()
      .minDistance(0)
      .onStart(() => {
        dragging.value = true;
        anyDragging.value = true;
        startOrder.value = order.value;
        startTop.value = topsOf(order.value, heights)[block.key];
        dragTop.value = startTop.value;
      })
      .onUpdate((e) => {
        const top = Math.max(0, Math.min(total - height, startTop.value + e.translationY));
        dragTop.value = top;
        // Whole blocks only move aside, so nothing lands inside a group.
        const next = orderAfterDrag(order.value, heights, block.key, top);
        if (next.join('|') !== order.value.join('|')) order.value = next;
      })
      .onFinalize(() => {
        if (!dragging.value) return;
        dragging.value = false;
        anyDragging.value = false;
        if (order.value.join('|') !== startOrder.value.join('|')) {
          const ids: ID[] = [];
          for (const key of order.value) for (const id of idsOf[key]) ids.push(id);
          scheduleOnRN(onDrop, ids);
        }
      });

  const blockStyle = useAnimatedStyle(() => {
    const resting = topsOf(order.value, heights)[block.key];
    return {
      top: dragging.value ? dragTop.value : withTiming(resting, { duration: 160 }),
      zIndex: dragging.value ? 10 : 0,
      transform: [{ scale: withTiming(dragging.value ? 1.02 : 1, { duration: 120 }) }],
      opacity: dragging.value ? 0.92 : 1,
    };
  });

  return (
    <Animated.View style={[styles.block, { height: height - ROW_GAP }, blockStyle]}>
      {block.group && <View style={styles.groupBox} />}
      {block.items.map((item, j) => (
        <View key={item.id} style={[styles.row, isRTL && styles.rowRTL, { top: j * STEP }]}>
          <GestureDetector gesture={makePan()}>
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
        </View>
      ))}
    </Animated.View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    block: { position: 'absolute', left: 0, right: 0 },
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
    // A group born together: one tinted box behind its rows, like the language list.
    groupBox: {
      position: 'absolute',
      top: -GROUP_PAD,
      bottom: -GROUP_PAD,
      left: -GROUP_PAD - 2,
      right: -GROUP_PAD - 2,
      borderRadius: 16,
      backgroundColor: `${theme.lineMarriage}38`,
    },
    link: {
      position: 'absolute',
      left: '50%',
      marginLeft: -LINK_SIZE / 2,
      width: LINK_SIZE,
      height: LINK_SIZE,
      borderRadius: LINK_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.panel,
      borderWidth: 1,
      borderColor: theme.stroke,
      zIndex: 20,
    },
    linkOn: { backgroundColor: theme.lineMarriage, borderColor: theme.lineMarriage },
    linkIcon: { fontSize: 12 },
    linkIconOff: { opacity: 0.35 },
  });
}
