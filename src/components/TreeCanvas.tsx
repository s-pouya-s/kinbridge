import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { FamilyData, ID, Marriage, Person } from '../types';
import { COL_SPACING, GENERATION_GROWTH_CAP, mirrorX, NODE_HEIGHT, NODE_WIDTH } from '../layout/layout';
import { computeParentChildLayout } from '../layout/parentChildLayout';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';

// The floor for both Reset's fit-by-height (see fitToViewport) and manual
// pinch-zoom-out — fit-by-height rarely needs it (a tree's generation count
// is bounded), so this mostly just stops a pinch gesture from zooming out
// to nothing.
const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;
const CANVAS_PADDING = 90;
const ARROW_HIT = 44;
/** Tap target diameter around a marriage's ⊕ — bigger than the 11px visual circle so it's easy to hit. */
const MARKER_HIT = 32;

interface Props {
  data: FamilyData;
  isRTL: boolean;
  editMode: boolean;
  /** Which screen axis generations grow along — 'vertical' (the original layout: generations top-to-bottom, siblings spread left-right) or 'horizontal' (generations left-to-right, siblings spread top-to-bottom). Cards themselves never rotate; only the arrangement direction changes. */
  orientation: 'vertical' | 'horizontal';
  /** View mode: opens the read-only sheet and recenters the tree on this person. */
  onPersonPress: (person: Person) => void;
  /** Edit mode: opens the editable form instead. */
  onPersonEdit: (person: Person) => void;
  onMarriagePress: (marriage: Marriage) => void;
  onMarriageEdit: (marriage: Marriage) => void;
  /** Bumped by the parent whenever it wants the view re-fit and re-centered (e.g. after import, or the reset button). */
  resetToken: number;
  /** Edit mode, the on-canvas ▲ ▼ arrows: move this person's whole row up or down a generation. */
  onMovePersonGeneration: (personId: ID, direction: 'up' | 'down') => void;
}

function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, v));
}

function cardColors(person: Person, theme: Theme) {
  if (person.unknown) return { fill: theme.panel2, stroke: theme.inkFaint };
  if (person.gender === 'male') return { fill: theme.maleFill, stroke: theme.maleStroke };
  if (person.gender === 'female') return { fill: theme.femaleFill, stroke: theme.femaleStroke };
  return { fill: theme.nodeFill, stroke: theme.nodeStroke };
}

/**
 * A straight line between two points, as a rotated plain View rather than
 * an SVG <Line> — react-native-svg rasterizes an entire <Svg> into one
 * native bitmap sized to that element's own width/height. For a large tree
 * (many generations or a wide row of siblings), that bitmap can exceed the
 * OS's hardware bitmap size limit and crash outright on the very next draw
 * — a real crash report: "Canvas: trying to draw too large bitmap", which
 * happens immediately on app open since the tree renders right away. Plain
 * Views don't share that limit; they're composited normally no matter how
 * many there are.
 */
function LineSegment({
  x1,
  y1,
  x2,
  y2,
  color,
  strokeWidth,
  dashed,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  dashed?: boolean;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      style={{
        position: 'absolute',
        left: x1,
        top: y1 - strokeWidth / 2,
        width: length,
        height: strokeWidth,
        backgroundColor: color,
        opacity: dashed ? 0.55 : 1,
        transform: [{ rotate: `${angleDeg}deg` }],
        transformOrigin: '0% 50%',
      }}
    />
  );
}

/** The tappable ⊕ marker's circle — see LineSegment for why this is a plain View, not an SVG <Circle>. */
function MarkerCircle({
  cx,
  cy,
  r,
  fill,
  stroke,
  strokeWidth,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: fill,
        borderWidth: strokeWidth,
        borderColor: stroke,
      }}
    />
  );
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
      style={({ pressed }) => ({
        position: 'absolute',
        left: tipX - ARROW_HIT / 2,
        top: tipY - ARROW_HIT / 2,
        width: ARROW_HIT,
        height: ARROW_HIT,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Text style={{ color, fontSize: 19 }}>{ARROW_GLYPH[dir]}</Text>
    </Pressable>
  );
}

export function TreeCanvas({
  data,
  isRTL,
  editMode,
  orientation,
  onPersonPress,
  onPersonEdit,
  onMarriagePress,
  onMarriageEdit,
  resetToken,
  onMovePersonGeneration,
}: Props) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const containerRef = useRef<View>(null);
  // Whichever screen axis generations run along — everything below that
  // measures/maps a point to the screen (content sizing, the initial fit
  // seed, fitToViewport, toCanvas, the union bars/lines, the generation
  // arrows) branches on this single flag rather than each independently
  // guessing which axis means "generation," so there's exactly one place
  // that decides it.
  const swap = orientation === 'horizontal';
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  /** Whoever was last tapped — used to gray out unrelated lines and, in edit
   * mode, to reveal that one card's move arrows. */
  const [selectedPersonId, setSelectedPersonId] = useState<ID | undefined>(undefined);
  /** Same idea as selectedPersonId, but for a marriage's ⊕ — edit mode only. */
  const [selectedMarriageId, setSelectedMarriageId] = useState<ID | undefined>(undefined);
  /** The "tap again to see/edit" hint fades on its own after a few seconds
   * rather than staying up until the next tap — it's only useful the first
   * moment someone selects a card, not as a permanent fixture on screen. */
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (!selectedPersonId) return;
    setShowHint(true);
    const id = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(id);
  }, [selectedPersonId]);

  const layout = useMemo(() => computeParentChildLayout(data), [data]);
  const peopleById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);

  // A card's own size (and its name font) grows modestly with the tree's
  // depth, same cap as computeParentChildLayout's own row-spacing growth
  // (see GENERATION_GROWTH_CAP) so both scale together. Reset/fit-to-
  // viewport fits the whole generation axis into the viewport (see
  // fitToViewport below), so a deeper tree already needs a *smaller* camera
  // scale just to show every row — without this, that shrinks the cards
  // and their text twice over as a tree grows, to the point where a big
  // family reads as an unlabeled grid of tiny boxes at the initial fit,
  // forcing a manual zoom in just to read a single name. A bigger base
  // card size (before that same camera scale is applied) keeps the
  // on-screen result legible without changing how zoom/pan themselves
  // work. Width's growth is capped well under COL_SPACING so a wider card
  // never crowds into its neighboring column; height and font have no such
  // ceiling since rowSpacing is growing right along with them.
  const cardGrowth = Math.min(layout.maxGen, GENERATION_GROWTH_CAP);
  const cardWidth = Math.min(NODE_WIDTH + cardGrowth * 2, COL_SPACING - 12);
  const cardHeight = NODE_HEIGHT + cardGrowth * 6;
  const cardNameFontSize = 16 + cardGrowth * 0.75;
  const cardAvatarSize = 38 * (cardHeight / NODE_HEIGHT);

  // layout.width/height are always "sibling extent" / "generation extent"
  // in that order, regardless of orientation — computeParentChildLayout
  // itself never knows or cares which way the tree will be drawn. Swapping
  // which one becomes the screen's width vs. height is *the* mechanism
  // orientation works through; everything below (the fit, toCanvas, the
  // union bars) just needs to agree on the same `swap` flag.
  const genExtent = layout.height;
  const sibExtent = layout.width;
  const contentWidth = (swap ? genExtent : sibExtent) + CANVAS_PADDING * 2;
  const contentHeight = (swap ? sibExtent : genExtent) + CANVAS_PADDING * 2;

  // The real fit-to-viewport effect below only runs once this component's
  // own onLayout has measured its actual size, which is a frame or more
  // after mount — until then the shared values below start at whatever
  // their initial value is. Seeding that initial value with a fit computed
  // from the window's size (available synchronously, no measuring needed)
  // means the very first paint already shows the tree centered, instead of
  // its untransformed top-left corner for that first frame.
  const window = useWindowDimensions();
  // Same fit-by-bounded-axis strategy as fitToViewport (see its own
  // comment) — matching it here means the very first paint doesn't briefly
  // show the tree at an illegibly tiny scale before Reset (or the
  // measured-viewport effect) corrects it a frame later.
  const initialBoundedViewport = swap ? window.width : window.height;
  const initialBoundedContent = swap ? contentWidth : contentHeight;
  const initialScale = clamp(initialBoundedViewport / initialBoundedContent, MIN_SCALE, 1);
  const initialTranslateX = swap ? window.width / 2 - (contentWidth / 2) * initialScale : 0;
  const initialTranslateY = swap ? 0 : window.height / 2 - (contentHeight / 2) * initialScale;

  const scale = useSharedValue(initialScale);
  const translateX = useSharedValue(initialTranslateX);
  const translateY = useSharedValue(initialTranslateY);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // A person's x is their raw cell position from computeParentChildLayout,
  // which can be negative — this shifts everything by -layout.minX before
  // it's usable as an actual screen coordinate (which does need to start
  // at/near 0), applied identically to every position so it never changes
  // anyone's position *relative* to anyone else, only where the whole tree
  // sits on screen. Mirrored in place for RTL around the tree's true
  // minX/maxX midpoint first, since that midpoint (unlike an assumed
  // 0..width box) doesn't move when minX does. `swap` transposes the two
  // logical axes onto the screen last — RTL only ever mirrors the sibling
  // axis (layout.ts's own x), same as in vertical mode; horizontal mode
  // doesn't also flip which screen direction generations grow in.
  const toCanvas = useCallback(
    (p: { x: number; y: number }) => {
      const lx = (isRTL ? mirrorX(p.x, layout.minX, layout.maxX) : p.x) - layout.minX + CANVAS_PADDING;
      const ly = p.y + CANVAS_PADDING;
      return swap ? { x: ly, y: lx } : { x: lx, y: ly };
    },
    [isRTL, layout.minX, layout.maxX, swap]
  );

  const fitToViewport = useCallback(
    (animated: boolean) => {
      // Prefer the actually-measured container size, but never just do
      // nothing if that measurement is (still, or ever) zero — falling back
      // to the window's own size means this can't get permanently stuck
      // un-fit, on a device/build where onLayout is slow or never fires.
      const vw = viewport.width || window.width;
      const vh = viewport.height || window.height;
      if (vw === 0 || vh === 0 || contentWidth === 0 || contentHeight === 0) return;
      // Fit by the *generation* axis alone, not the narrower of width/height
      // — a tree's generation count is bounded (a handful of rows), but its
      // sibling extent grows without bound as people are added, so fitting
      // to the sibling axis on a tree wide enough (a real, previously-
      // shipped bug: a ~70-person tree needed scale 0.04 to fit its whole
      // ~9000px width, which shrinks a 140×72 card to about 6×3 screen
      // pixels — invisible, not just small) would do the same thing here.
      // Which screen dimension is the generation axis flips with
      // orientation — vertical fits by screen height, horizontal by screen
      // width — but the axis being fit is always the same, bounded one.
      // Exploring the unbounded sibling axis is what panning is for;
      // Reset's job is to land at a scale where cards are actually legible,
      // pinned to the tree's own start edge on that axis so it's a real
      // root family in view, not an arbitrary cross-section from the
      // geometric middle of a wide, unevenly-populated tree.
      const boundedViewport = swap ? vw : vh;
      const boundedContent = swap ? contentWidth : contentHeight;
      const fitScale = clamp(boundedViewport / boundedContent, MIN_SCALE, 1);
      const tx = swap ? vw / 2 - (contentWidth / 2) * fitScale : 0;
      const ty = swap ? 0 : vh / 2 - (contentHeight / 2) * fitScale;
      // withTiming was the one call in this whole file that never actually
      // landed on a real device (a real, previously-shipped bug) — the
      // initial, un-animated fit on mount (which just assigns .value
      // directly) always worked, so Reset now does the same thing instead
      // of depending on withTiming at all. `animated` is kept as a
      // parameter rather than removed outright since it's still meaningful
      // documentation at each call site (mount vs. explicit reset).
      void animated;
      scale.value = fitScale;
      translateX.value = tx;
      translateY.value = ty;
    },
    [viewport, contentWidth, contentHeight, window.width, window.height, swap]
  );

  // Initial fit, once the canvas has been measured.
  useEffect(() => {
    fitToViewport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

  // Flipping orientation transposes the whole tree — the camera's current
  // scale/pan describes a completely different geometry the instant this
  // changes, not just a stale-but-still-valid view of the same one, so
  // this re-fits immediately rather than leaving the tree wherever the old
  // orientation's numbers happen to place it under the new one.
  useEffect(() => {
    fitToViewport(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation]);

  // Defensive retry: onLayout should always fire after mount, but if it
  // somehow doesn't (or reports 0 on some device/build), re-measure the
  // container directly a moment later rather than leaving the camera stuck
  // on whatever the window-dimensions-based initial guess was.
  useEffect(() => {
    if (viewport.width > 0 && viewport.height > 0) return;
    const id = setTimeout(() => {
      containerRef.current?.measure((_x, _y, width, height) => {
        if (width > 0 && height > 0) setViewport({ width, height });
      });
    }, 300);
    return () => clearTimeout(id);
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
    setSelectedPersonId(undefined);
    setSelectedMarriageId(undefined);
    fitToViewport(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

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

  // Half the card's screen extent along whichever axis generations run
  // along — the distance from a card's center to the edge facing the next
  // (or previous) generation. The card itself never rotates with
  // orientation, so this is the only thing that has to: a card's "forward"
  // edge is its bottom in vertical mode, its right side in horizontal mode.
  const genCardHalf = swap ? cardWidth / 2 : cardHeight / 2;
  // The screen point one card-edge's distance from `p`, toward the next
  // generation (dir=1, e.g. a spouse's card down/across to the marriage
  // bar) or the previous one (dir=-1, e.g. a child's card back up/across
  // to its parents' marker).
  const genEdge = useCallback((p: { x: number; y: number }, dir: 1 | -1) => (swap ? { x: p.x + dir * genCardHalf, y: p.y } : { x: p.x, y: p.y + dir * genCardHalf }), [swap, genCardHalf]);
  // A point on a marriage's bar, level with `p` along the sibling axis —
  // the bar itself sits at one fixed generation-axis coordinate
  // (`genScreen`, shared by both spouses and their marker) but spans
  // however far apart the two spouses are along the sibling axis, so this
  // is what makes it a horizontal line in vertical mode and a vertical one
  // in horizontal mode.
  const barPoint = useCallback((genScreen: number, p: { x: number; y: number }) => (swap ? { x: genScreen, y: p.y } : { x: p.x, y: genScreen }), [swap]);

  // Every translateX/translateY this file computes (fitToViewport, the
  // pinch/wheel focal-point math, the initial seed) assumes a plain
  // top-left pivot: screen = translate + scale * localPoint. React
  // Native/CSS's actual default pivot for a `transform` array is the
  // element's own center, not its top-left corner — and unlike a plain
  // (non-animated) style, a `transformOrigin` set alongside a
  // Reanimated-driven `transform` isn't reliably honored by the native
  // transform-matrix path (a real, previously-shipped bug: relying on it
  // fixed Reset's centering, since that always renders once at a fresh
  // scale/translate pair, but broke pinch/wheel zoom, which nudges
  // translate and scale together on every frame — the center pivot crept
  // back in, and each zoom step walked the camera sideways). Rather than
  // depend on transformOrigin at all, this bakes the standard
  // "translate-to-center, scale, translate-back" cancellation directly into
  // the array using the box's real center (contentWidth/2, contentHeight/2)
  // — the actual default pivot on every platform — so the net effect is
  // exactly the plain top-left-pivot mapping every formula in this file
  // already assumes, regardless of whether the engine also happens to
  // apply transformOrigin.
  const pivotX = contentWidth / 2;
  const pivotY = contentHeight / 2;
  const contentStyle = useAnimatedStyle(() => ({
    width: contentWidth,
    height: contentHeight,
    transform: [
      { translateX: translateX.value - pivotX },
      { translateY: translateY.value - pivotY },
      { scale: scale.value },
      { translateX: pivotX },
      { translateY: pivotY },
    ],
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
        {/* Full-viewport hit area for the gesture — without it, the pan/pinch
            region was only as big as the tree's own rendered content box, so
            a small tree (or one zoomed out to a small scale) left most of
            the screen unresponsive to drag/pinch. The Animated.View below is
            free to be any size/position; this is what the gesture actually
            binds to. */}
        <View style={styles.gestureArea}>
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {layout.unions.map((u) => {
              const spouseA = peopleById.get(u.marriage.spouseIds[0]);
              const spouseB = peopleById.get(u.marriage.spouseIds[1]);
              const posA = layout.positions.get(u.marriage.spouseIds[0]);
              const posB = layout.positions.get(u.marriage.spouseIds[1]);
              if (!spouseA || !spouseB || !posA || !posB) return null;

              const a = toCanvas(posA);
              const b = toCanvas(posB);
              const marker = toCanvas({ x: u.markerX, y: u.markerY });
              // The bar's fixed generation-axis screen coordinate — read
              // off the marker rather than recomputed from u.barY, since
              // buildUnions always sets markerY exactly equal to barY (the
              // marker sits on the bar) and toCanvas has already resolved
              // which screen axis that lands on for this orientation.
              const genScreen = swap ? marker.x : marker.y;
              const aEdge = genEdge(a, 1);
              const bEdge = genEdge(b, 1);
              const aBar = barPoint(genScreen, a);
              const bBar = barPoint(genScreen, b);

              // Once someone is selected, every line dims to gray except the
              // ones actually touching them: their own marriage(s), and the
              // blood line down to each of their own children.
              const isConnected =
                !selectedPersonId ||
                u.marriage.spouseIds.includes(selectedPersonId) ||
                u.marriage.childIds.includes(selectedPersonId);
              const color = isConnected ? (u.marriage.status === 'current' ? theme.lineMarriage : theme.lineEnded) : theme.stroke;
              const dashed = u.marriage.status === 'ended';

              return (
                <React.Fragment key={u.marriage.id}>
                  <LineSegment x1={aEdge.x} y1={aEdge.y} x2={aBar.x} y2={aBar.y} color={color} strokeWidth={2} dashed={dashed} />
                  <LineSegment x1={bEdge.x} y1={bEdge.y} x2={bBar.x} y2={bBar.y} color={color} strokeWidth={2} dashed={dashed} />
                  <LineSegment x1={aBar.x} y1={aBar.y} x2={bBar.x} y2={bBar.y} color={color} strokeWidth={2} dashed={dashed} />
                  {u.marriage.childIds.map((childId) => {
                    const childPos = layout.positions.get(childId);
                    if (!childPos) return null;
                    const c = toCanvas(childPos);
                    const cEdge = genEdge(c, -1);
                    const childConnected = isConnected || childId === selectedPersonId;
                    return (
                      <LineSegment
                        key={childId}
                        x1={marker.x}
                        y1={marker.y}
                        x2={cEdge.x}
                        y2={cEdge.y}
                        color={childConnected ? theme.lineBlood : theme.stroke}
                        strokeWidth={1.8}
                      />
                    );
                  })}
                  <MarkerCircle cx={marker.x} cy={marker.y} r={11} fill={theme.panel2} stroke={color} strokeWidth={1.8} />
                  <LineSegment x1={marker.x - 5} y1={marker.y} x2={marker.x + 5} y2={marker.y} color={color} strokeWidth={1.8} />
                  <LineSegment x1={marker.x} y1={marker.y - 5} x2={marker.x} y2={marker.y + 5} color={color} strokeWidth={1.8} />
                </React.Fragment>
              );
            })}
          </View>

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
            return (
              <PersonCard
                key={person.id}
                person={person}
                x={c.x}
                y={c.y}
                width={cardWidth}
                height={cardHeight}
                nameFontSize={cardNameFontSize}
                avatarSize={cardAvatarSize}
                isSelected={isSelected}
                colors={cardColors(person, theme)}
                onPress={handlePersonPress}
                unknownLabel={t('unknown')}
                theme={theme}
                styles={styles}
              />
            );
          })}

          {/* Edit-mode-only move controls, on the canvas itself rather than
              tucked inside the detail popup — a discoverable way to nudge a
              card's generation up or down. Shown only for whichever single
              card is currently selected (first tap), not for every card at
              once — with this many people on screen, arrows everywhere would
              be unreadable. Marriage ⊕ markers aren't movable — they're
              always placed automatically, centered over their own children —
              so there are no arrows for them. Its own top layer (after the
              cards) so they're never covered by a neighboring card;
              box-none lets touches on the empty parts of this layer fall
              through to the cards/pan gesture underneath.

              Only earlier/later generation exist — position *within* a
              generation is fully automatic (determined by family
              structure), so there's no row-order concept for a
              perpendicular arrow to nudge. computeGenerations only ever
              pushes a generation down to stay below a blood parent, it
              never pulls one up to close an otherwise-unrelated gap, so a
              freshly added parent can land several rows above their child
              with nothing in between; nudging it down with these arrows
              (which just set manualGeneration) is the way to fix that by
              hand. The arrows themselves point along whichever screen axis
              generations actually run on — up/down when vertical,
              left/right when horizontal — even though the underlying
              "earlier"/"later" direction they report to
              onMovePersonGeneration never changes. */}
          {editMode &&
            selectedPersonId &&
            (() => {
              const pos = layout.positions.get(selectedPersonId);
              if (!pos) return null;
              const c = toCanvas(pos);
              const genArrowDist = (swap ? cardWidth : cardHeight) / 2 + 22;
              const earlierDir = swap ? 'left' : 'up';
              const laterDir = swap ? 'right' : 'down';
              return (
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  <DirectionArrow cx={c.x} cy={c.y} dir={earlierDir} dist={genArrowDist} color={theme.lineMarriage} onPress={() => onMovePersonGeneration(selectedPersonId, 'up')} />
                  <DirectionArrow cx={c.x} cy={c.y} dir={laterDir} dist={genArrowDist} color={theme.lineMarriage} onPress={() => onMovePersonGeneration(selectedPersonId, 'down')} />
                </View>
              );
            })()}
        </Animated.View>
        </View>
      </GestureDetector>

      {selectedPersonId && showHint && (
        <View style={[styles.hintBar, { bottom: 18 + insets.bottom }]} pointerEvents="none">
          <Text style={styles.hintText}>{editMode ? t('tapAgainToEdit') : t('tapAgainForInfo')}</Text>
        </View>
      )}
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
  width,
  height,
  nameFontSize,
  avatarSize,
  isSelected,
  colors,
  onPress,
  unknownLabel,
  theme,
  styles,
}: {
  person: Person;
  x: number;
  y: number;
  /** The tree's current (generation-depth-scaled) card size — see TreeCanvas's cardWidth/cardHeight. */
  width: number;
  height: number;
  nameFontSize: number;
  avatarSize: number;
  isSelected: boolean;
  colors: { fill: string; stroke: string };
  onPress: (person: Person) => void;
  unknownLabel: string;
  theme: Theme;
  styles: Styles;
}) {
  return (
    <Animated.View
      layout={LinearTransition.duration(450)}
      style={[
        styles.card,
        {
          left: x - width / 2,
          top: y - height / 2,
          width,
          height,
          borderColor: isSelected ? theme.selected : colors.stroke,
          borderWidth: isSelected ? 2.2 : person.unknown ? 1.4 : 1,
          borderStyle: person.unknown ? 'dashed' : 'solid',
          backgroundColor: colors.fill,
        },
      ]}
    >
      <Pressable style={({ pressed }) => [styles.cardTouchable, pressed && styles.cardTouchablePressed]} onPress={() => onPress(person)}>
        {person.photoUri && (
          <Image source={{ uri: person.photoUri }} style={[styles.cardAvatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]} />
        )}
        <Text
          numberOfLines={1}
          style={[styles.cardName, { fontSize: nameFontSize }, person.unknown && { color: theme.inkFaint, fontSize: nameFontSize * 0.75 }]}
        >
          {person.unknown ? unknownLabel : person.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden', backgroundColor: theme.bg },
  gestureArea: { flex: 1 },
  // No transformOrigin override here — see contentStyle's own comment for
  // why the top-left-pivot behavior every translate/scale formula in this
  // file assumes is instead baked directly into that transform array.
  content: { position: 'absolute', top: 0, left: 0 },
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
  cardTouchablePressed: { opacity: 0.6 },
  cardAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.panel },
  cardName: {
    color: theme.ink,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
  },
  hintBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: theme.inkDim,
    fontSize: 12.5,
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  });
}
