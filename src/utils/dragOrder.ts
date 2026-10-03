/**
 * Where a dragged block lands in a list of blocks (DraggableChildList): a
 * block is one child, or a whole group of children born together, and only
 * whole blocks ever move aside, so nothing can land inside a group. Pure
 * worklets, so the drag gesture can call them and the checks can test them.
 */

/** Each block's top for an order of blocks: one after another, each as tall as its rows. */
export function topsOf(order: string[], heights: Record<string, number>): Record<string, number> {
  'worklet';
  const tops: Record<string, number> = {};
  let y = 0;
  for (const key of order) {
    tops[key] = y;
    y += heights[key];
  }
  return tops;
}

/**
 * The order with `key` moved to where it's being dragged (`top` is the
 * dragged block's top). Blocks can be different heights (a group is several
 * rows), so the leading edge decides: dragged up, the block passes every
 * block whose middle its top edge has crossed; dragged down, every block
 * whose middle its bottom edge has crossed.
 */
export function orderAfterDrag(order: string[], heights: Record<string, number>, key: string, top: number): string[] {
  'worklet';
  const now = topsOf(order, heights)[key];
  const edge = top < now ? top : top + heights[key];
  const others = order.filter((k) => k !== key);
  let y = 0;
  let index = 0;
  for (const other of others) {
    if (y + heights[other] / 2 < edge) index++;
    else break;
    y += heights[other];
  }
  return [...others.slice(0, index), key, ...others.slice(index)];
}
