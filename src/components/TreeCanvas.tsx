import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { FamilyData, ID, Marriage, Person } from '../types';
import { CARD_METRICS, GENERATION_GROWTH_CAP, MARKER_RADIUS, mirrorX, NODE_HEIGHT, NODE_WIDTH, UNION_LANE_STEP, type CardStyle } from '../layout/layout';
import { computeParentChildLayout } from '../layout/parentChildLayout';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { LineSegment } from './LineSegment';
import { clamp, clampAxis } from '../utils/camera';
import { cardColors, raisedCardStyle } from './cardLook';
import { MourningRibbon } from './MourningRibbon';
import { isDeceased } from '../model/people';
import { Minimap, MINIMAP_RESERVE, type MinimapCard, type MinimapLine } from './Minimap';

// The floor for both Reset's fit-by-height (see fitToViewport) and manual
// pinch-zoom-out — fit-by-height rarely needs it (a tree's generation count
// is bounded), so this mostly just stops a pinch gesture from zooming out
// to nothing.
const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;
const CANVAS_PADDING = 90;
const ARROW_HIT = 44;
/** Tap target diameter around a marriage's ⊕ — a full finger's width, and no more than UNION_LANE_STEP so two stacked markers never share a tap area. */
const MARKER_HIT = UNION_LANE_STEP - 2;

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
  /** Compact (name beside a small photo) or large (a tall card, big photo on top) — a setting in the side menu. */
  cardStyle: CardStyle;
  /**
   * Set while someone is choosing a person by tapping them on the tree (see
   * RelationshipSheet): the next card tap goes here instead of selecting it,
   * and a banner in place of the minimap says so.
   */
  pickPrompt?: { message: string; cancelLabel: string; onPick: (person: Person) => void; onCancel: () => void };
  /** Someone to start centered on and selected (a person's own tree, see PersonTreeView), instead of the tree's left edge. */
  focusPersonId?: ID;
  /** The black mourning ribbon on deceased people's cards — a setting in the side menu; on unless turned off. */
  showRibbon?: boolean;
  /** Replaces the "tap again" hint shown under a selected card, for a canvas where a second tap does something else. */
  tapAgainHint?: string;
  /** Edit mode only: the on-canvas + button, opposite the ↻ one. */
  onAddPerson: () => void;
  /** The overview map at the top of the canvas — a setting in the side menu. */
  showMinimap: boolean;
  /** Edit mode, the on-canvas ▲ ▼ arrows: move this person's whole row up or down a generation. */
  onMovePersonGeneration: (personId: ID, direction: 'up' | 'down') => void;
}



/** The tappable ⊕ marker's circle — see LineSegment.tsx for why this is a plain View, not an SVG <Circle>. */
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
      <Text style={{ color, fontSize: 24 }}>{ARROW_GLYPH[dir]}</Text>
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
  cardStyle,
  pickPrompt,
  focusPersonId,
  showRibbon = true,
  tapAgainHint,
  onAddPerson,
  showMinimap,
  onMovePersonGeneration,
}: Props) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const containerRef = useRef<View>(null);
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

  const metrics = CARD_METRICS[cardStyle];
  const layout = useMemo(() => computeParentChildLayout(data, metrics), [data, metrics]);
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
  const cardWidth = Math.min(metrics.nodeWidth + cardGrowth * 2, metrics.colSpacing - 12);
  const cardHeight = metrics.nodeHeight + cardGrowth * metrics.heightGrowthPerGen;
  const cardNameFontSize = (cardStyle === 'large' ? 20 : 18) + cardGrowth * 0.75;
  // Compact: a small round photo beside the name. Large: a big square photo
  // across the top of the card, leaving room below for the name.
  const cardAvatarSize = cardStyle === 'large' ? Math.min(cardWidth - 28, cardHeight - 88) : 46 * (cardHeight / metrics.nodeHeight);

  // Generations always run top-to-bottom and siblings left-to-right. Turning
  // the phone just gives the same tree a wider or taller viewport, which the
  // viewport-size effect below re-fits to.
  const contentWidth = layout.width + CANVAS_PADDING * 2;
  const contentHeight = layout.height + CANVAS_PADDING * 2;

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
  // Only leave room at the top when the minimap is actually there.
  const topReserve = showMinimap ? MINIMAP_RESERVE : 0;
  const initialFitHeight = window.height - topReserve;
  const initialScale = clamp(initialFitHeight / contentHeight, MIN_SCALE, 1);
  const initialTranslateX = 0;
  const initialTranslateY = topReserve + initialFitHeight / 2 - (contentHeight / 2) * initialScale;

  const scale = useSharedValue(initialScale);
  const translateX = useSharedValue(initialTranslateX);
  const translateY = useSharedValue(initialTranslateY);
  /** The pinch gesture's own cumulative e.scale as of its previous update — see the pan/pinch comment below. */
  const lastPinchScale = useSharedValue(1);

  // A person's x is their raw cell position from computeParentChildLayout,
  // which can be negative — this shifts everything by -layout.minX before
  // it's usable as an actual screen coordinate (which does need to start
  // at/near 0), applied identically to every position so it never changes
  // anyone's position *relative* to anyone else, only where the whole tree
  // sits on screen. Mirrored in place for RTL around the tree's true
  // minX/maxX midpoint first, since that midpoint (unlike an assumed
  // 0..width box) doesn't move when minX does.
  const toCanvas = useCallback(
    (p: { x: number; y: number }) => {
      const lx = (isRTL ? mirrorX(p.x, layout.minX, layout.maxX) : p.x) - layout.minX + CANVAS_PADDING;
      return { x: lx, y: p.y + CANVAS_PADDING };
    },
    [isRTL, layout.minX, layout.maxX]
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
      // Fit by height (the generation axis) alone, not the narrower of width/height
      // — a tree's generation count is bounded (a handful of rows), but its
      // sibling extent grows without bound as people are added, so fitting
      // to the sibling axis on a tree wide enough (a real, previously-
      // shipped bug: a ~70-person tree needed scale 0.04 to fit its whole
      // ~9000px width, which shrinks a 140×72 card to about 6×3 screen
      // pixels — invisible, not just small) would do the same thing here.
      // Exploring the unbounded sibling axis is what panning is for;
      // Reset's job is to land at a scale where cards are actually legible,
      // pinned to the tree's own start edge on that axis so it's a real
      // root family in view, not an arbitrary cross-section from the
      // geometric middle of a wide, unevenly-populated tree.
      // Fit into the part of the canvas below the minimap, so the oldest
      // generation doesn't start out hidden underneath it.
      const fitHeight = Math.max(vh - topReserve, vh / 2);
      const fitScale = clamp(fitHeight / contentHeight, MIN_SCALE, 1);
      // Centered on the focus person when there is one; otherwise pinned to
      // the tree's own start edge (see above).
      const focusPos = focusPersonId ? layout.positions.get(focusPersonId) : undefined;
      const tx = focusPos ? vw / 2 - toCanvas(focusPos).x * fitScale : 0;
      const ty = vh - fitHeight + fitHeight / 2 - (contentHeight / 2) * fitScale;
      // withTiming was the one call in this whole file that never actually
      // landed on a real device (a real, previously-shipped bug) — the
      // initial, un-animated fit on mount (which just assigns .value
      // directly) always worked, so Reset now does the same thing instead
      // of depending on withTiming at all. `animated` is kept as a
      // parameter rather than removed outright since it's still meaningful
      // documentation at each call site (mount vs. explicit reset).
      void animated;
      scale.value = fitScale;
      translateX.value = clampAxis(tx, contentWidth, vw, fitScale);
      translateY.value = clampAxis(ty, contentHeight, vh, fitScale);
    },
    [viewport, contentWidth, contentHeight, window.width, window.height, topReserve, focusPersonId, layout, toCanvas]
  );

  useEffect(() => {
    if (!focusPersonId) return;
    setSelectedPersonId(focusPersonId);
    fitToViewport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPersonId]);

  // The whole tree changes size with the card style, so the old camera
  // would point at the wrong place; start again from a fresh fit.
  useEffect(() => {
    fitToViewport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardStyle]);

  // Initial fit, once the canvas has been measured — and again whenever its
  // size changes, e.g. when the phone is rotated.
  useEffect(() => {
    fitToViewport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

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
  // The wheel listener below is attached once, so it reads the tree's
  // current size through this ref rather than a stale closure.
  const boundsRef = useRef({ cw: contentWidth, ch: contentHeight });
  boundsRef.current = { cw: contentWidth, ch: contentHeight };

  // When the tree shrinks (someone deleted, a new import) or the screen
  // turns, the camera may now sit outside the tree's area; pull it back in.
  useEffect(() => {
    const vw = viewport.width || window.width;
    const vh = viewport.height || window.height;
    translateX.value = clampAxis(translateX.value, contentWidth, vw, scale.value);
    translateY.value = clampAxis(translateY.value, contentHeight, vh, scale.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, contentHeight, viewport.width, viewport.height]);

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
      translateX.value = clampAxis(focalX - ((focalX - translateX.value) * next) / scale.value, boundsRef.current.cw, rect.width, next);
      translateY.value = clampAxis(focalY - ((focalY - translateY.value) * next) / scale.value, boundsRef.current.ch, rect.height, next);
      scale.value = next;
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clears any selection and re-fits the tree — shared by the on-canvas ↻
  // button and the parent's resetToken (e.g. after an import).
  const resetView = () => {
    setSelectedPersonId(undefined);
    setSelectedMarriageId(undefined);
    fitToViewport(true);
  };

  useEffect(() => {
    if (resetToken === 0) return;
    resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  // Pan and pinch run simultaneously, so both apply *incremental* changes to
  // the camera rather than recomputing it from a saved start snapshot. The
  // snapshot version (a real, previously-shipped bug) had each gesture
  // overwrite the other's work on every frame — pan reset translate to
  // "start + finger travel", discarding pinch's focal-point correction, then
  // pinch reset it back, and they also clobbered each other's shared saved
  // start value whenever one began mid-way through the other. The visible
  // result was the camera sliding sideways on every zoom. Now pan owns
  // movement (its changeX/changeY already track the fingers' midpoint) and
  // pinch owns only zooming around the current focal point.
  const boundsWidth = viewport.width || window.width;
  const boundsHeight = viewport.height || window.height;
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onChange((e) => {
      translateX.value = clampAxis(translateX.value + e.changeX, contentWidth, boundsWidth, scale.value);
      translateY.value = clampAxis(translateY.value + e.changeY, contentHeight, boundsHeight, scale.value);
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
      translateX.value = clampAxis(e.focalX - (e.focalX - translateX.value) * applied, contentWidth, boundsWidth, next);
      translateY.value = clampAxis(e.focalY - (e.focalY - translateY.value) * applied, contentHeight, boundsHeight, next);
      scale.value = next;
    });

  const composedGesture = Gesture.Simultaneous(pan, pinch);

  // The point on a card's bottom edge (dir=1, e.g. a spouse's card down to
  // the marriage bar) or top edge (dir=-1, e.g. a child's card back up to
  // its parents' marker).
  const genEdge = useCallback((p: { x: number; y: number }, dir: 1 | -1) => ({ x: p.x, y: p.y + dir * (cardHeight / 2) }), [cardHeight]);
  // A point on a marriage's horizontal bar (at height `genScreen`), directly
  // below `p`.
  const barPoint = useCallback((genScreen: number, p: { x: number; y: number }) => ({ x: p.x, y: genScreen }), []);

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

  const minimapCards = useMemo<MinimapCard[]>(
    () =>
      data.people.flatMap((person) => {
        const pos = layout.positions.get(person.id);
        return pos ? [{ id: person.id, ...toCanvas(pos), color: cardColors(person, theme).stroke }] : [];
      }),
    [data.people, layout.positions, toCanvas, theme]
  );
  // The same lines the canvas draws: each spouse's drop to the marriage
  // bar, the bar itself, and the links down to each child.
  const minimapLines = useMemo<MinimapLine[]>(
    () =>
      layout.unions.flatMap((u) => {
        const posA = layout.positions.get(u.marriage.spouseIds[0]);
        const posB = layout.positions.get(u.marriage.spouseIds[1]);
        if (!posA || !posB) return [];
        const marker = toCanvas({ x: u.markerX, y: u.markerY });
        const a = toCanvas(posA);
        const b = toCanvas(posB);
        const aEdge = genEdge(a, 1);
        const bEdge = genEdge(b, 1);
        const couple = [
          { x1: aEdge.x, y1: aEdge.y, x2: a.x, y2: marker.y },
          { x1: bEdge.x, y1: bEdge.y, x2: b.x, y2: marker.y },
          { x1: a.x, y1: marker.y, x2: b.x, y2: marker.y },
        ];
        const children = u.marriage.childIds.flatMap((childId) => {
          const childPos = layout.positions.get(childId);
          if (!childPos) return [];
          const cEdge = genEdge(toCanvas(childPos), -1);
          return [{ x1: marker.x, y1: marker.y, x2: cEdge.x, y2: cEdge.y }];
        });
        return [...couple, ...children];
      }),
    [layout, toCanvas, genEdge]
  );

  // First tap on a card just selects it — highlighting its own lines and,
  // in view mode, recentering the tree on it. Only a second tap on that same
  // (already-selected) card opens the info sheet / edit form. Tapping a
  // different card always counts as a fresh first tap for that one.
  const handlePersonPress = (person: Person) => {
    if (pickPrompt) {
      pickPrompt.onPick(person);
      return;
    }
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
              // marker sits on the bar).
              const genScreen = marker.y;
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
                  <LineSegment x1={aEdge.x} y1={aEdge.y} x2={aBar.x} y2={aBar.y} color={color} strokeWidth={3} dashed={dashed} />
                  <LineSegment x1={bEdge.x} y1={bEdge.y} x2={bBar.x} y2={bBar.y} color={color} strokeWidth={3} dashed={dashed} />
                  <LineSegment x1={aBar.x} y1={aBar.y} x2={bBar.x} y2={bBar.y} color={color} strokeWidth={3} dashed={dashed} />
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
                        strokeWidth={2.8}
                      />
                    );
                  })}
                  <MarkerCircle cx={marker.x} cy={marker.y} r={MARKER_RADIUS} fill={theme.panel2} stroke={color} strokeWidth={3.5} />
                  <LineSegment x1={marker.x - 13} y1={marker.y} x2={marker.x + 13} y2={marker.y} color={color} strokeWidth={4.5} />
                  <LineSegment x1={marker.x} y1={marker.y - 13} x2={marker.x} y2={marker.y + 13} color={color} strokeWidth={4.5} />
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
                cardStyle={cardStyle}
                isRTL={isRTL}
                showRibbon={showRibbon}
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
              hand. */}
          {editMode &&
            selectedPersonId &&
            (() => {
              const pos = layout.positions.get(selectedPersonId);
              if (!pos) return null;
              const c = toCanvas(pos);
              const genArrowDist = cardHeight / 2 + 22;
              return (
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  <DirectionArrow cx={c.x} cy={c.y} dir="up" dist={genArrowDist} color={theme.lineMarriage} onPress={() => onMovePersonGeneration(selectedPersonId, 'up')} />
                  <DirectionArrow cx={c.x} cy={c.y} dir="down" dist={genArrowDist} color={theme.lineMarriage} onPress={() => onMovePersonGeneration(selectedPersonId, 'down')} />
                </View>
              );
            })()}
        </Animated.View>
        </View>
      </GestureDetector>

      {pickPrompt ? (
        <View style={[styles.pickBanner, isRTL && styles.pickBannerRTL]}>
          <Text style={styles.pickBannerText}>{pickPrompt.message}</Text>
          <Pressable onPress={pickPrompt.onCancel} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={styles.pickBannerCancel}>{pickPrompt.cancelLabel}</Text>
          </Pressable>
        </View>
      ) : showMinimap && (
      <Minimap
        contentWidth={contentWidth}
        contentHeight={contentHeight}
        cards={minimapCards}
        lines={minimapLines}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        viewport={viewport}
        scale={scale}
        translateX={translateX}
        translateY={translateY}
        selectedId={selectedPersonId}
        isRTL={isRTL}
        theme={theme}
      />
      )}

      {selectedPersonId && showHint && (
        <View style={styles.hintBar} pointerEvents="none">
          <Text style={styles.hintText}>{tapAgainHint ?? (editMode ? t('tapAgainToEdit') : t('tapAgainForInfo'))}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.resetButton, isRTL ? styles.cornerLeft : styles.cornerRight, pressed && styles.resetButtonPressed]}
        onPress={resetView}
        accessibilityLabel={t('resetView')}
        hitSlop={6}
      >
        <Text style={styles.resetButtonText}>↻</Text>
      </Pressable>

      {editMode && (
        <Pressable
          style={({ pressed }) => [styles.resetButton, styles.addButton, isRTL ? styles.cornerRight : styles.cornerLeft, pressed && styles.resetButtonPressed]}
          onPress={onAddPerson}
          accessibilityLabel={t('addPerson')}
          hitSlop={6}
        >
          <Text style={[styles.resetButtonText, styles.addButtonText]}>+</Text>
        </Pressable>
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
  cardStyle,
  isRTL,
  showRibbon,
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
  cardStyle: CardStyle;
  isRTL: boolean;
  showRibbon: boolean;
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
          borderWidth: isSelected ? 2.5 : person.unknown ? 1.5 : 1,
          borderStyle: person.unknown ? 'dashed' : 'solid',
          // Selected turns the whole card green, not just its outline.
          backgroundColor: isSelected ? theme.selectedFill : colors.fill,
          // See raisedCardStyle. An unknown person's card stays flat, as a placeholder.
          ...(person.unknown ? null : raisedCardStyle(isSelected ? theme.selectedFill : colors.fill, theme)),
        },
      ]}
    >
      {cardStyle === 'large' ? (
        <Pressable style={({ pressed }) => [styles.cardTouchableLarge, pressed && styles.cardTouchablePressed]} onPress={() => onPress(person)}>
          {person.photoUri ? (
            <Image source={{ uri: person.photoUri }} style={[styles.cardPhotoLarge, { width: avatarSize, height: avatarSize }]} />
          ) : (
            // No photo yet: the same square, holding their initial.
            <View style={[styles.cardPhotoLarge, styles.cardPhotoPlaceholder, { width: avatarSize, height: avatarSize, borderColor: colors.stroke }]}>
              <Text style={[styles.cardInitial, { color: colors.stroke, fontSize: avatarSize * 0.42 }]}>{person.unknown ? '?' : person.name.charAt(0)}</Text>
            </View>
          )}
          <Text
            numberOfLines={1}
            style={[styles.cardName, styles.cardNameLarge, { fontSize: nameFontSize }, person.unknown && { color: theme.inkFaint, fontSize: nameFontSize * 0.8 }]}
          >
            {person.unknown ? unknownLabel : person.name}
          </Text>
          {!person.unknown && !!person.surname && (
            <Text numberOfLines={1} style={[styles.cardSurname, { fontSize: nameFontSize * 0.7 }]}>
              {person.surname}
            </Text>
          )}
        </Pressable>
      ) : (
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
      )}
      {showRibbon && isDeceased(person) && <MourningRibbon radius={15} side="left" thickness={cardStyle === 'large' ? 16 : 11} />}
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
    borderRadius: 16,
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
  cardTouchableLarge: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 14,
    paddingHorizontal: 10,
  },
  cardPhotoLarge: { borderRadius: 14, backgroundColor: theme.panel },
  cardPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, opacity: 0.9 },
  cardInitial: { fontWeight: '700' },
  cardNameLarge: { marginTop: 10, textAlign: 'center' },
  cardSurname: { color: theme.inkDim, fontWeight: '600', marginTop: 1, textAlign: 'center' },
  cardAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.panel },
  cardName: {
    color: theme.ink,
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
  },
  // Inset on both sides by more than the ↻ button's footprint, so a long
  // hint wraps instead of running under that button.
  hintBar: {
    position: 'absolute',
    bottom: 18,
    left: 80,
    right: 80,
    alignItems: 'center',
  },
  resetButton: {
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
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pickBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.panel,
    borderWidth: 1.5,
    borderColor: theme.selected,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    boxShadow: `0px 4px 12px ${theme.cardShadow}`,
  },
  pickBannerRTL: { flexDirection: 'row-reverse' },
  pickBannerText: { flex: 1, color: theme.ink, fontSize: 14, fontWeight: '600' },
  pickBannerCancel: { color: theme.lineEnded, fontSize: 13.5, fontWeight: '700' },
  cornerRight: { right: 16 },
  cornerLeft: { left: 16 },
  resetButtonPressed: { opacity: 0.55 },
  // Same round button as ↻, filled in the edit-mode accent so it reads as
  // the one edit action, not another view control.
  addButton: { backgroundColor: theme.lineMarriage, borderColor: theme.lineMarriage },
  addButtonText: { color: theme.bg, fontSize: 28, lineHeight: 32 },
  resetButtonText: { color: theme.ink, fontSize: 24, fontWeight: '700', lineHeight: 28 },
  hintText: {
    color: theme.inkDim,
    fontSize: 12.5,
    textAlign: 'center',
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
