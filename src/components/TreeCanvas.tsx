import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import type { FamilyData, ID, Marriage, Person } from '../types';
import { computeLayout, mirrorX, NODE_HEIGHT, NODE_WIDTH } from '../layout/layout';
import { theme } from '../theme';
import { useI18n } from '../i18n';

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;
const CANVAS_PADDING = 90;
const ARROW_HIT = 28;
const CARD_ARROW_DIST_X = NODE_WIDTH / 2 + 12;
const CARD_ARROW_DIST_Y = NODE_HEIGHT / 2 + 16;
/** Tap target diameter around a marriage's ⊕ — bigger than the 11px visual circle so it's easy to hit. */
const MARKER_HIT = 32;

interface Props {
  data: FamilyData;
  isRTL: boolean;
  editMode: boolean;
  /** View mode: opens the read-only sheet and recenters the tree on this person. */
  onPersonPress: (person: Person) => void;
  /** Edit mode: opens the editable form instead. */
  onPersonEdit: (person: Person) => void;
  onMarriagePress: (marriage: Marriage) => void;
  onMarriageEdit: (marriage: Marriage) => void;
  /** Bumped by the parent whenever it wants the view re-fit and re-centered (e.g. after import, or the reset button). */
  resetToken: number;
  /**
   * Set by the parent right after creating a person (a new standalone
   * person, a new spouse, a new child) so the camera pans to reveal them —
   * otherwise a person added outside the current viewport (e.g. starting a
   * second, unconnected family tree via "+ Person") lands somewhere the
   * user can't see and has no way to find. Pans only; never reorders the
   * layout or changes zoom.
   */
  focusPersonId?: ID | null;
  /** Edit mode, the on-canvas ‹ › arrows: swap with the immediate neighbor in that direction — one slot, never "between". */
  onMovePersonStep: (personId: ID, direction: 'earlier' | 'later') => void;
  /** Edit mode, the on-canvas ▲ ▼ arrows: move this person's whole row up or down a generation. */
  onMovePersonGeneration: (personId: ID, direction: 'up' | 'down') => void;
}

function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, v));
}

function cardColors(person: Person) {
  if (person.unknown) return { fill: theme.panel2, stroke: theme.inkFaint };
  if (person.gender === 'male') return { fill: theme.maleFill, stroke: theme.maleStroke };
  if (person.gender === 'female') return { fill: theme.femaleFill, stroke: theme.femaleStroke };
  return { fill: theme.nodeFill, stroke: theme.nodeStroke };
}

type ArrowDir = 'up' | 'down' | 'left' | 'right';

const ARROW_GLYPH: Record<ArrowDir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

/**
 * A single small directional glyph in a Pressable, not an SVG shape — SVG
 * shapes with onPress route through react-native-svg's web Touchable
 * wrapper, which uses React's long-deprecated mixin-based Touchable APIs
 * (see the "TouchableMixin is deprecated" warning) and can throw outright
 * under React 19 on web. A plain Pressable is the same mechanism PersonCard
 * already uses without issue, so every tappable control on the canvas goes
 * through it instead of an SVG element's own onPress.
 */
function DirectionArrow({ cx, cy, dir, dist, color, onPress }: { cx: number; cy: number; dir: ArrowDir; dist: number; color: string; onPress: () => void }) {
  const tipX = cx + (dir === 'left' ? -dist : dir === 'right' ? dist : 0);
  const tipY = cy + (dir === 'up' ? -dist : dir === 'down' ? dist : 0);
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        left: tipX - ARROW_HIT / 2,
        top: tipY - ARROW_HIT / 2,
        width: ARROW_HIT,
        height: ARROW_HIT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontSize: 13 }}>{ARROW_GLYPH[dir]}</Text>
    </Pressable>
  );
}

export function TreeCanvas({
  data,
  isRTL,
  editMode,
  onPersonPress,
  onPersonEdit,
  onMarriagePress,
  onMarriageEdit,
  resetToken,
  focusPersonId,
  onMovePersonStep,
  onMovePersonGeneration,
}: Props) {
  const { t } = useI18n();
  const containerRef = useRef<View>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [priorityPair, setPriorityPair] = useState<[ID, ID] | undefined>(undefined);
  /** Decoupled from priorityPair (which needs a *pair* to reorder around) — this
   * is just "whoever was last tapped", used to gray out unrelated lines and,
   * in edit mode, to reveal that one card's move arrows. */
  const [selectedPersonId, setSelectedPersonId] = useState<ID | undefined>(undefined);
  /** Same idea as selectedPersonId, but for a marriage's ⊕ — edit mode only. */
  const [selectedMarriageId, setSelectedMarriageId] = useState<ID | undefined>(undefined);

  const layout = useMemo(() => computeLayout(data, priorityPair), [data, priorityPair]);
  const peopleById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);

  const contentWidth = layout.width + CANVAS_PADDING * 2;
  const contentHeight = layout.height + CANVAS_PADDING * 2;

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  /**
   * A ‹ › row move can, at the edge of a row, be the first thing anywhere in
   * the tree to push the overall x-extent (layout.minX/maxX) further out
   * than it's ever been — and since toCanvas's -layout.minX shift (above)
   * moves with that extent, every card's *canvas* coordinate shifts by the
   * same amount, even though nobody's actual position moved relative to
   * anyone else. With a static camera that reads as "the screen moved" for
   * a card the user never touched. This cancels it out: right before such a
   * move, remember some *other* person's current screen position; once the
   * new layout lands, nudge the camera by whatever it takes to put that
   * same person back at that exact screen position. The mover's own card
   * still visibly slides — only everyone else stays perfectly still.
   */
  const pendingCompensation = useRef<{ anchorId: ID; screenX: number; screenY: number } | null>(null);

  // computeLayout never renormalizes positions to start at 0 (see its
  // docstring) — a person's x is just their raw cell position, which can be
  // negative. That's what keeps an edit from perturbing anyone else's
  // position (see layout.ts), but it means this has to shift everything by
  // -layout.minX before it's usable as an actual screen/SVG coordinate
  // (which does need to start at/near 0) — a single shift applied identically
  // to every position, so it never changes anyone's position *relative* to
  // anyone else, only where the whole tree sits on screen. Mirrored in place
  // for RTL around the tree's true minX/maxX midpoint first, since that
  // midpoint (unlike an assumed 0..width box) doesn't move when minX does.
  const toCanvas = useCallback(
    (p: { x: number; y: number }) => ({
      x: (isRTL ? mirrorX(p.x, layout.minX, layout.maxX) : p.x) - layout.minX + CANVAS_PADDING,
      y: p.y + CANVAS_PADDING,
    }),
    [isRTL, layout.minX, layout.maxX]
  );

  // Called right before dispatching a ‹ › row move — see pendingCompensation
  // above. The anchor just needs to be *someone whose own cell can't change
  // as a side effect of this move* — movePersonOneStep only ever touches the
  // mover and, at most, one same-row neighbor it swaps with, so anyone in a
  // different row already qualifies.
  const armCompensation = useCallback(
    (movingPersonId: ID) => {
      const movingPos = layout.positions.get(movingPersonId);
      const anchor = data.people.find(
        (p) => p.id !== movingPersonId && layout.positions.has(p.id) && (!movingPos || layout.positions.get(p.id)!.y !== movingPos.y)
      );
      if (!anchor) return;
      const c = toCanvas(layout.positions.get(anchor.id)!);
      pendingCompensation.current = {
        anchorId: anchor.id,
        screenX: translateX.value + c.x * scale.value,
        screenY: translateY.value + c.y * scale.value,
      };
    },
    [data.people, layout, toCanvas]
  );

  // Consumes whatever armCompensation queued, once the move it was queued
  // for has actually landed and this layout reflects it.
  useEffect(() => {
    const pending = pendingCompensation.current;
    if (!pending) return;
    pendingCompensation.current = null;
    const newPos = layout.positions.get(pending.anchorId);
    if (!newPos) return;
    const c = toCanvas(newPos);
    const newScreenX = translateX.value + c.x * scale.value;
    const newScreenY = translateY.value + c.y * scale.value;
    translateX.value += pending.screenX - newScreenX;
    translateY.value += pending.screenY - newScreenY;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const fitToViewport = useCallback(
    (animated: boolean) => {
      if (viewport.width === 0 || viewport.height === 0) return;
      const fitScale = clamp(
        Math.min(viewport.width / contentWidth, viewport.height / contentHeight),
        MIN_SCALE,
        1
      );
      const tx = viewport.width / 2 - (contentWidth / 2) * fitScale;
      const ty = viewport.height / 2 - (contentHeight / 2) * fitScale;
      if (animated) {
        scale.value = withTiming(fitScale, { duration: 400 });
        translateX.value = withTiming(tx, { duration: 400 });
        translateY.value = withTiming(ty, { duration: 400 });
      } else {
        scale.value = fitScale;
        translateX.value = tx;
        translateY.value = ty;
      }
    },
    [viewport, contentWidth, contentHeight]
  );

  // Initial fit, once the canvas has been measured.
  useEffect(() => {
    fitToViewport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

  // Gesture.Pinch() only ever fires for an actual touch pinch — trackpad and
  // mouse-wheel scrolling on web don't reach it at all, so without this,
  // scrolling over the canvas did nothing (or scrolled the page). react-native-web
  // forwards a View's ref to its underlying DOM node, so this attaches a real
  // 'wheel' listener and zooms around the cursor, matching the pinch math below.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const focalX = e.clientX - rect.left;
      const focalY = e.clientY - rect.top;
      const zoomFactor = Math.exp(-e.deltaY * 0.0015);
      const next = clamp(scale.value * zoomFactor, MIN_SCALE, MAX_SCALE);
      translateX.value = focalX - ((focalX - translateX.value) * next) / scale.value;
      translateY.value = focalY - ((focalY - translateY.value) * next) / scale.value;
      scale.value = next;
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explicit reset (parent bumps resetToken, e.g. the Reset button, or after import).
  useEffect(() => {
    if (resetToken === 0) return;
    setPriorityPair(undefined);
    setSelectedPersonId(undefined);
    setSelectedMarriageId(undefined);
    fitToViewport(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  // Recenter the camera (not the zoom level) on whoever was just tapped, once
  // the reordered layout has actually been computed for them.
  useEffect(() => {
    if (!priorityPair || viewport.width === 0) return;
    const raw = layout.positions.get(priorityPair[0]);
    if (!raw) return;
    const point = toCanvas(raw);
    const s = scale.value;
    translateX.value = withTiming(viewport.width / 2 - point.x * s, { duration: 450 });
    translateY.value = withTiming(viewport.height / 2 - point.y * s, { duration: 450 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, priorityPair]);

  // Pan (only — never reorders anything) to reveal a person the parent just created.
  useEffect(() => {
    if (!focusPersonId || viewport.width === 0) return;
    const raw = layout.positions.get(focusPersonId);
    if (!raw) return;
    const point = toCanvas(raw);
    const s = scale.value;
    translateX.value = withTiming(viewport.width / 2 - point.x * s, { duration: 450 });
    translateY.value = withTiming(viewport.height / 2 - point.y * s, { duration: 450 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, focusPersonId]);

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      translateX.value = e.focalX - ((e.focalX - savedTranslateX.value) * next) / savedScale.value;
      translateY.value = e.focalY - ((e.focalY - savedTranslateY.value) * next) / savedScale.value;
      scale.value = next;
    });

  const composedGesture = Gesture.Simultaneous(pan, pinch);

  const contentStyle = useAnimatedStyle(() => ({
    width: contentWidth,
    height: contentHeight,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  // First tap on a card just selects it — highlighting its own lines and,
  // in view mode, recentering the tree on it. Only a second tap on that same
  // (already-selected) card opens the info sheet / edit form. Tapping a
  // different card always counts as a fresh first tap for that one.
  const handlePersonPress = (person: Person) => {
    const alreadySelected = selectedPersonId === person.id;

    if (editMode) {
      if (alreadySelected) {
        onPersonEdit(person);
      } else {
        setSelectedPersonId(person.id);
      }
      return;
    }

    if (alreadySelected) {
      onPersonPress(person);
      return;
    }

    setSelectedPersonId(person.id);
    if (person.unknown) {
      setPriorityPair(undefined);
      return;
    }
    const currentMarriage = data.marriages.find((m) => m.status === 'current' && m.spouseIds.includes(person.id));
    const spouseId = currentMarriage?.spouseIds.find((id) => id !== person.id);
    setPriorityPair(spouseId ? [person.id, spouseId] : undefined);
  };

  // Same select-then-act pattern as handlePersonPress: in edit mode, a first
  // tap on a ⊕ selects it (revealing its move arrows below), a second tap on
  // that same, already-selected ⊕ opens the marriage edit form. View mode is
  // unchanged — a single tap opens the read-only sheet directly, since there
  // are no arrows to reveal there.
  const handleUnionPress = (marriage: Marriage) => {
    if (editMode) {
      if (selectedMarriageId === marriage.id) {
        onMarriageEdit(marriage);
      } else {
        setSelectedMarriageId(marriage.id);
      }
      return;
    }
    onMarriagePress(marriage);
  };

  return (
    <View
      ref={containerRef}
      style={styles.fill}
      onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.content, contentStyle]}>
          <Svg width={contentWidth} height={contentHeight} style={StyleSheet.absoluteFill}>
            {layout.unions.map((u) => {
              const spouseA = peopleById.get(u.marriage.spouseIds[0]);
              const spouseB = peopleById.get(u.marriage.spouseIds[1]);
              const posA = layout.positions.get(u.marriage.spouseIds[0]);
              const posB = layout.positions.get(u.marriage.spouseIds[1]);
              if (!spouseA || !spouseB || !posA || !posB) return null;

              const a = toCanvas(posA);
              const b = toCanvas(posB);
              const barY = u.barY + CANVAS_PADDING;
              const marker = toCanvas({ x: u.markerX, y: u.markerY });

              // Once someone is selected, every line dims to gray except the
              // ones actually touching them: their own marriage(s), and the
              // blood line down to each of their own children.
              const isConnected =
                !selectedPersonId ||
                u.marriage.spouseIds.includes(selectedPersonId) ||
                u.marriage.childIds.includes(selectedPersonId);
              const color = isConnected ? (u.marriage.status === 'current' ? theme.lineMarriage : theme.lineEnded) : theme.stroke;
              const dash = u.marriage.status === 'ended' ? '5,4' : undefined;

              return (
                <React.Fragment key={u.marriage.id}>
                  <Line x1={a.x} y1={a.y + NODE_HEIGHT / 2} x2={a.x} y2={barY} stroke={color} strokeWidth={2} strokeDasharray={dash} />
                  <Line x1={b.x} y1={b.y + NODE_HEIGHT / 2} x2={b.x} y2={barY} stroke={color} strokeWidth={2} strokeDasharray={dash} />
                  <Line x1={a.x} y1={barY} x2={b.x} y2={barY} stroke={color} strokeWidth={2} strokeDasharray={dash} />
                  {u.marriage.childIds.map((childId) => {
                    const childPos = layout.positions.get(childId);
                    if (!childPos) return null;
                    const c = toCanvas(childPos);
                    const childConnected = isConnected || childId === selectedPersonId;
                    return (
                      <Line
                        key={childId}
                        x1={marker.x}
                        y1={marker.y}
                        x2={c.x}
                        y2={c.y - NODE_HEIGHT / 2}
                        stroke={childConnected ? theme.lineBlood : theme.stroke}
                        strokeWidth={1.8}
                      />
                    );
                  })}
                  <Circle cx={marker.x} cy={marker.y} r={11} fill={theme.panel2} stroke={color} strokeWidth={1.8} strokeDasharray={dash} />
                  <Line x1={marker.x - 5} y1={marker.y} x2={marker.x + 5} y2={marker.y} stroke={color} strokeWidth={1.8} />
                  <Line x1={marker.x} y1={marker.y - 5} x2={marker.x} y2={marker.y + 5} stroke={color} strokeWidth={1.8} />
                </React.Fragment>
              );
            })}
          </Svg>

          {/* Tap targets for the ⊕ markers above, as plain Pressables rather
              than onPress on the SVG Circle itself — see DirectionArrow's
              comment for why. */}
          {layout.unions.map((u) => {
            const marker = toCanvas({ x: u.markerX, y: u.markerY });
            return (
              <Pressable
                key={u.marriage.id}
                onPress={() => handleUnionPress(u.marriage)}
                style={{
                  position: 'absolute',
                  left: marker.x - MARKER_HIT / 2,
                  top: marker.y - MARKER_HIT / 2,
                  width: MARKER_HIT,
                  height: MARKER_HIT,
                }}
              />
            );
          })}

          {data.people.map((person) => {
            const pos = layout.positions.get(person.id);
            if (!pos) return null;
            const c = toCanvas(pos);
            const isSelected = selectedPersonId === person.id;
            const isSelectedSpouse = !isSelected && priorityPair?.[1] === person.id;
            return (
              <PersonCard
                key={person.id}
                person={person}
                x={c.x}
                y={c.y}
                isSelected={isSelected}
                isSelectedSpouse={isSelectedSpouse}
                colors={cardColors(person)}
                onPress={handlePersonPress}
                unknownLabel={t('unknown')}
              />
            );
          })}

          {/* Edit-mode-only move controls, on the canvas itself rather than
              tucked inside the detail popup — a discoverable way to nudge a
              card one step at a time. Shown only for whichever single card is
              currently selected (first tap), not for every card at once —
              with this many people on screen, arrows everywhere would be
              unreadable. Marriage ⊕ markers aren't movable — they're always
              placed automatically, one single row per generation — so there
              are no arrows for them. Its own top layer (after the cards) so
              they're never covered by a neighboring card; box-none lets
              touches on the empty parts of this layer fall through to the
              cards/pan gesture underneath. */}
          {editMode &&
            selectedPersonId &&
            (() => {
              const pos = layout.positions.get(selectedPersonId);
              if (!pos) return null;
              const c = toCanvas(pos);
              return (
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  <DirectionArrow cx={c.x} cy={c.y} dir="up" dist={CARD_ARROW_DIST_Y} color={theme.lineMarriage} onPress={() => onMovePersonGeneration(selectedPersonId, 'up')} />
                  <DirectionArrow cx={c.x} cy={c.y} dir="down" dist={CARD_ARROW_DIST_Y} color={theme.lineMarriage} onPress={() => onMovePersonGeneration(selectedPersonId, 'down')} />
                  <DirectionArrow
                    cx={c.x}
                    cy={c.y}
                    dir="left"
                    dist={CARD_ARROW_DIST_X}
                    color={theme.lineBlood}
                    onPress={() => {
                      armCompensation(selectedPersonId);
                      onMovePersonStep(selectedPersonId, isRTL ? 'later' : 'earlier');
                    }}
                  />
                  <DirectionArrow
                    cx={c.x}
                    cy={c.y}
                    dir="right"
                    dist={CARD_ARROW_DIST_X}
                    color={theme.lineBlood}
                    onPress={() => {
                      armCompensation(selectedPersonId);
                      onMovePersonStep(selectedPersonId, isRTL ? 'earlier' : 'later');
                    }}
                  />
                </View>
              );
            })()}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * A single person's card. Its own component (not inlined in the .map() above)
 * so its position change (from an arrow move, say) gets its own smooth
 * LinearTransition instead of the whole tree re-laying-out instantly.
 */
function PersonCard({
  person,
  x,
  y,
  isSelected,
  isSelectedSpouse,
  colors,
  onPress,
  unknownLabel,
}: {
  person: Person;
  x: number;
  y: number;
  isSelected: boolean;
  isSelectedSpouse: boolean;
  colors: { fill: string; stroke: string };
  onPress: (person: Person) => void;
  unknownLabel: string;
}) {
  return (
    <Animated.View
      layout={LinearTransition.duration(450)}
      style={[
        styles.card,
        {
          left: x - NODE_WIDTH / 2,
          top: y - NODE_HEIGHT / 2,
          borderColor: isSelected ? theme.lineMarriage : isSelectedSpouse ? theme.lineBlood : colors.stroke,
          borderWidth: isSelected || isSelectedSpouse ? 2.2 : person.unknown ? 1.4 : 1,
          borderStyle: person.unknown ? 'dashed' : 'solid',
          backgroundColor: colors.fill,
        },
      ]}
    >
      <Pressable style={styles.cardTouchable} onPress={() => onPress(person)}>
        {person.photoUri && <Image source={{ uri: person.photoUri }} style={styles.cardAvatar} />}
        <Text numberOfLines={1} style={[styles.cardName, person.unknown && { color: theme.inkFaint, fontSize: 12 }]}>
          {person.unknown ? unknownLabel : person.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden', backgroundColor: theme.bg },
  content: { position: 'relative' },
  card: {
    position: 'absolute',
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    // react-native-web only: without this, a click-drag over a card starts the
    // browser's native text selection instead of the canvas's own pan
    // gesture. No effect on native, where userSelect isn't a thing.
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
  },
  cardTouchable: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  cardAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.panel },
  cardName: {
    color: theme.ink,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
  },
});
