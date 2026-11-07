/** Worklet-safe camera math shared by the tree canvas and the relationship chart. */

export function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, v));
}

/** How far past the tree's edge the camera may drift, as a fraction of the screen (big trees). */
const EDGE_SLACK = 0.4;
/**
 * …but never more than this fraction of the tree's own size on screen, so a
 * small family can't be dragged far into empty space (the owner's rule:
 * people got lost exploring around a few cards). Big trees are unaffected.
 */
const EDGE_SLACK_OF_TREE = 0.25;

/**
 * The range clampAxis keeps one camera axis's translate in. Defined before clampAxis on purpose:
 * Reanimated captures what a worklet calls when this file loads, so a
 * worklet defined later is still undefined then ("undefined is not a
 * function", a real, previously-shipped bug).
 */
export function axisBounds(content: number, view: number, s: number): [number, number] {
  'worklet';
  const scaled = content * s;
  const slack = Math.min(view * EDGE_SLACK, scaled * EDGE_SLACK_OF_TREE);
  return scaled >= view ? [view - scaled - slack, slack] : [-slack, view - scaled + slack];
}

/**
 * Keeps one camera axis near the tree. `t` is that axis's translate,
 * `content` the tree's unscaled extent, `view` the canvas's extent. When the
 * scaled tree is bigger than the screen, the screen has to stay over the
 * tree; when it's smaller (zoomed out), the tree has to stay on the screen.
 * Either way there's EDGE_SLACK of the screen's worth of give past the
 * tree's edge, so someone can pull a little into empty space, but never so
 * far they lose the tree. The space to move through is the tree's own area,
 * which grows with the tree.
 */
export function clampAxis(t: number, content: number, view: number, s: number, startReserve?: number) {
  'worklet';
  const [min, max] = axisBounds(content, view, s);
  // `startReserve`: extra room at the start of the axis (the top, under the
  // minimap), so the first cards can be pulled out from under it.
  return clamp(t, min, max + (startReserve ?? 0));
}
