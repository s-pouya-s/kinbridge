/** Worklet-safe camera math shared by the tree canvas and the relationship chart. */

export function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, v));
}

/** How far past the tree's edge the camera may drift, as a fraction of the screen. */
const EDGE_SLACK = 0.4;

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
export function clampAxis(t: number, content: number, view: number, s: number) {
  'worklet';
  const scaled = content * s;
  const slack = view * EDGE_SLACK;
  return scaled >= view ? clamp(t, view - scaled - slack, slack) : clamp(t, -slack, view - scaled + slack);
}
