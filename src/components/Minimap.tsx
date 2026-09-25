import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { ID } from '../types';
import type { Theme } from '../theme';
import { LineSegment } from './LineSegment';

/**
 * Always wide, whichever way the phone is held: trees grow sideways as
 * people are added (generations stay a handful of rows). The height is
 * fixed; the width starts at MAP_MIN_WIDTH and stretches with the tree's
 * own shape, so a wide family fills the map instead of shrinking to a thin
 * strip across its middle, up to the screen's width (less a margin each
 * side) or MAP_MAX_WIDTH on a tablet.
 */
const MAP_MIN_WIDTH = 150;
const MAP_MAX_WIDTH = 600;
const MAP_HEIGHT = 84;
/** Room between the map's frame and the tree drawn inside it. */
const MAP_INSET = 7;
const EDGE_OFFSET = 12;
/** Mini cards never shrink below this, so even a huge tree still reads as cards. */
const MIN_CARD = 2.5;

/** How much of the canvas's top edge the minimap covers — TreeCanvas's fit keeps the tree below this. */
export const MINIMAP_RESERVE = EDGE_OFFSET + MAP_HEIGHT;

export interface MinimapCard {
  id: ID;
  /** Card center, in the same content coordinates TreeCanvas's toCanvas returns. */
  x: number;
  y: number;
  color: string;
}

export interface MinimapLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Props {
  contentWidth: number;
  contentHeight: number;
  cards: MinimapCard[];
  lines: MinimapLine[];
  cardWidth: number;
  cardHeight: number;
  viewport: { width: number; height: number };
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  selectedId?: ID;
  isRTL: boolean;
  theme: Theme;
}

/**
 * A small copy of the whole tree, pinned to the canvas's top end corner (the
 * same side as the ↻ button), so someone zoomed into one branch can still
 * tell where in the family they are. Everything off screen is dimmed, which
 * leaves the part in view lit up inside a gold frame.
 *
 * TreeCanvas keeps the camera near the tree's own area (see its clampAxis),
 * so the map only has to show that area: the mapping from tree to map is
 * a plain fixed scale, and only the frame moves. The frame is the inverse of
 * the canvas's camera (screen = translate + scale * content, so the visible
 * region starts at -translate / scale and spans viewport / scale), driven
 * straight off the same shared values so it tracks every pan/pinch frame
 * without a React re-render. The frame is clipped to the map's edge, so
 * drifting past the tree (or zooming out past all of it) presses the frame
 * against that edge instead of leaving the map.
 *
 * Display only: pointerEvents="none" never steals a pan or a tap meant for a
 * card beneath it.
 */
export function Minimap({ contentWidth, contentHeight, cards, lines, cardWidth, cardHeight, viewport, scale, translateX, translateY, selectedId, isRTL, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const vw = viewport.width;
  const vh = viewport.height;
  // As wide as the tree needs at this height, within the limits above.
  const naturalWidth = ((MAP_HEIGHT - MAP_INSET * 2) * contentWidth) / Math.max(contentHeight, 1) + MAP_INSET * 2;
  const mapWidth = Math.max(MAP_MIN_WIDTH, Math.min(naturalWidth, vw - EDGE_OFFSET * 2, MAP_MAX_WIDTH));
  const mapHeight = MAP_HEIGHT;

  const k = Math.min((mapWidth - MAP_INSET * 2) / contentWidth, (mapHeight - MAP_INSET * 2) / contentHeight);
  const offX = (mapWidth - contentWidth * k) / 2;
  const offY = (mapHeight - contentHeight * k) / 2;
  const miniCardWidth = Math.max(cardWidth * k, MIN_CARD);
  const miniCardHeight = Math.max(cardHeight * k, MIN_CARD);

  // The in-view region, in map coordinates, clipped to the map's frame.
  const frame = useDerivedValue(() => {
    const s = scale.value;
    const left = Math.max(offX + (-translateX.value / s) * k, 0);
    const top = Math.max(offY + (-translateY.value / s) * k, 0);
    const right = Math.min(offX + ((vw - translateX.value) / s) * k, mapWidth);
    const bottom = Math.min(offY + ((vh - translateY.value) / s) * k, mapHeight);
    return { left, top, right: Math.max(right, left), bottom: Math.max(bottom, top) };
  });

  // Four dimming panes around the frame: full width above and below it,
  // and the two sides level with it.
  const dimTop = useAnimatedStyle(() => ({ left: 0, top: 0, width: mapWidth, height: frame.value.top }));
  const dimBottom = useAnimatedStyle(() => ({ left: 0, top: frame.value.bottom, width: mapWidth, height: mapHeight - frame.value.bottom }));
  const dimLeft = useAnimatedStyle(() => ({ left: 0, top: frame.value.top, width: frame.value.left, height: frame.value.bottom - frame.value.top }));
  const dimRight = useAnimatedStyle(() => ({
    left: frame.value.right,
    top: frame.value.top,
    width: mapWidth - frame.value.right,
    height: frame.value.bottom - frame.value.top,
  }));
  const frameStyle = useAnimatedStyle(() => ({
    left: frame.value.left,
    top: frame.value.top,
    width: frame.value.right - frame.value.left,
    height: frame.value.bottom - frame.value.top,
  }));

  if (vw === 0 || vh === 0 || contentWidth === 0 || contentHeight === 0) return null;

  return (
    <View style={[styles.shadow, { width: mapWidth, height: mapHeight }, isRTL ? styles.left : styles.right]} pointerEvents="none">
      <View style={styles.map}>
        {lines.map((l, i) => (
          <LineSegment key={i} x1={offX + l.x1 * k} y1={offY + l.y1 * k} x2={offX + l.x2 * k} y2={offY + l.y2 * k} color={theme.inkFaint} strokeWidth={0.6} />
        ))}
        {cards.map((c) => (
          <View
            key={c.id}
            style={[
              styles.card,
              {
                left: offX + c.x * k - miniCardWidth / 2,
                top: offY + c.y * k - miniCardHeight / 2,
                width: miniCardWidth,
                height: miniCardHeight,
                borderRadius: Math.min(miniCardWidth, miniCardHeight) / 3,
                backgroundColor: c.id === selectedId ? theme.selected : c.color,
              },
            ]}
          />
        ))}
        <Animated.View style={[styles.dim, dimTop]} />
        <Animated.View style={[styles.dim, dimBottom]} />
        <Animated.View style={[styles.dim, dimLeft]} />
        <Animated.View style={[styles.dim, dimRight]} />
        <Animated.View style={[styles.frame, frameStyle]} />
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    // The outer view carries the shadow and the inner one clips, since a
    // single view with overflow: 'hidden' clips its own shadow away on iOS.
    shadow: {
      position: 'absolute',
      top: EDGE_OFFSET,
      borderRadius: 12,
      backgroundColor: theme.minimapBg,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    right: { right: EDGE_OFFSET },
    left: { left: EDGE_OFFSET },
    map: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.stroke,
      backgroundColor: theme.minimapBg,
      overflow: 'hidden',
    },
    card: { position: 'absolute' },
    dim: { position: 'absolute', backgroundColor: theme.minimapDim },
    frame: { position: 'absolute', borderWidth: 1.5, borderColor: theme.lineMarriage, borderRadius: 3 },
  });
}
