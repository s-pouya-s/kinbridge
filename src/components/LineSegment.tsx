import React from 'react';
import { View } from 'react-native';

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
export function LineSegment({
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
