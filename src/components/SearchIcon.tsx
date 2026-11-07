import React from 'react';
import { View } from 'react-native';

/**
 * A magnifier drawn from two Views (a ring and a short handle), not a glyph,
 * which some Android fonts lack. Used by the tree's search button and the
 * person boxes in Find relationship.
 */
export function SearchIcon({ size = 22, color }: { size?: number; color: string }) {
  const k = size / 22;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View style={{ position: 'absolute', left: 1 * k, top: 1 * k, width: 15 * k, height: 15 * k, borderRadius: 7.5 * k, borderWidth: 2.5 * k, borderColor: color }} />
      <View
        style={{ position: 'absolute', left: 14 * k, top: 13 * k, width: 3 * k, height: 9 * k, borderRadius: 1.5 * k, backgroundColor: color, transform: [{ rotate: '-45deg' }] }}
      />
    </View>
  );
}

/**
 * A tiny family tree drawn from Views (one card on top, a line down to two
 * cards), for "Pick on tree" buttons. Drawn, not a glyph or emoji.
 */
export function TreeIcon({ size = 22, color }: { size?: number; color: string }) {
  const k = size / 22;
  const box = (left: number, top: number) => ({ position: 'absolute' as const, left: left * k, top: top * k, width: 8 * k, height: 6 * k, borderRadius: 1.5 * k, backgroundColor: color });
  const line = (left: number, top: number, width: number, height: number) => ({ position: 'absolute' as const, left: left * k, top: top * k, width: width * k, height: height * k, backgroundColor: color });
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View style={box(7, 2)} />
      <View style={line(10.25, 8, 1.5, 4)} />
      <View style={line(4, 11.25, 14, 1.5)} />
      <View style={line(4, 11.25, 1.5, 4)} />
      <View style={line(16.5, 11.25, 1.5, 4)} />
      <View style={box(1, 15)} />
      <View style={box(13, 15)} />
    </View>
  );
}
