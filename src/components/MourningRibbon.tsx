import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

interface Props {
  /** The card's own corner radius (inside its border), so the ribbon is clipped to the same rounded shape. */
  radius: number;
  /** Which top corner it crosses. Every card uses the top-left, in either language. */
  side: 'left' | 'right';
  /** Band thickness; the rest scales from it. Bigger for the large card style. */
  thickness?: number;
}

/**
 * The black mourning ribbon across a deceased person's card corner, the
 * way a memorial photo is marked. A diagonal band, clipped to the card's
 * rounded corner. Black on its own vanishes against the dark theme's cards,
 * so it carries a bright outline there (theme.ribbonEdge) and a softer one
 * in light mode. Never takes touches: the card underneath stays
 * tappable.
 */
export function MourningRibbon({ radius, side, thickness = 11 }: Props) {
  const { theme } = useTheme();
  const length = thickness * 7;
  const offset = thickness * 1.1;
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
      <View
        style={[
          styles.band,
          {
            width: length,
            height: thickness,
            top: offset,
            [side]: -length * 0.28,
            borderColor: theme.ribbonEdge,
            transform: [{ rotate: side === 'left' ? '-45deg' : '45deg' }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    backgroundColor: '#050505',
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
  },
});
