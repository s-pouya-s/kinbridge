import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import type { CardStyle } from '../layout/layout';

interface Props {
  visible: boolean;
  onClose: () => void;
  editMode: boolean;
  onToggleEditMode: () => void;
  onToggleLocale: () => void;
  onToggleTheme: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  cardStyle: CardStyle;
  onToggleCardStyle: () => void;
  showRibbon: boolean;
  onToggleRibbon: () => void;
  onHelp: () => void;
  onFindRelationship: () => void;
  onPersonTree: () => void;
  onImport: () => void;
  onExport: () => void;
}

/**
 * Every app-wide action and setting, behind the header's ☰ button. Slides in
 * from the same (start) edge the ☰ sits on, so it's the right edge in
 * Persian and the left in English.
 *
 * Actions that change what's on screen (edit mode)
 * or open something else (help, a person's tree, find relationship, import, export) close the menu
 * first, so the result is visible right away and no two Modals are ever
 * stacked. Language, theme, the map, the card style and the ribbon leave it open, since the menu itself is where
 * that change shows up first.
 */
export function SideMenu({
  visible,
  onClose,
  editMode,
  onToggleEditMode,
  onToggleLocale,
  onToggleTheme,
  showMinimap,
  onToggleMinimap,
  cardStyle,
  onToggleCardStyle,
  showRibbon,
  onToggleRibbon,
  onHelp,
  onFindRelationship,
  onPersonTree,
  onImport,
  onExport,
}: Props) {
  const { t, isRTL, locale } = useI18n();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const panelWidth = Math.min(300, window.width * 0.8);

  const closeThen = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, isRTL && styles.backdropRTL]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('closeMenu')} />
        <Animated.View
          entering={isRTL ? SlideInRight.duration(220) : SlideInLeft.duration(220)}
          style={[
            styles.panel,
            isRTL ? styles.panelRTL : styles.panelLTR,
            {
              width: panelWidth + (isRTL ? insets.right : insets.left),
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 12,
              paddingLeft: isRTL ? 0 : insets.left,
              paddingRight: isRTL ? insets.right : 0,
            },
          ]}
        >
          <Text style={[styles.title, isRTL && styles.textRTL]}>{t('appTitle')}</Text>
          <ScrollView contentContainerStyle={styles.list}>
            <MenuRow
              styles={styles}
              label={t('editMode')}
              value={editMode ? t('on') : t('off')}
              active={editMode}
              onPress={closeThen(onToggleEditMode)}
            />
            <View style={styles.divider} />
            {/* Each language is named in itself, not translated, so someone
                who can't read the current one can still find their own. */}
            <MenuRow styles={styles} label={t('language')} value={locale === 'fa' ? 'فارسی' : 'English'} onPress={onToggleLocale} />
            <MenuRow styles={styles} label={t('themeLabel')} icon={mode === 'dark' ? '🌙' : '☀️'} value={mode === 'dark' ? t('dark') : t('light')} onPress={onToggleTheme} />
            <MenuRow styles={styles} label={t('minimap')} value={showMinimap ? t('on') : t('off')} active={showMinimap} onPress={onToggleMinimap} />
            <MenuRow styles={styles} label={t('cardStyle')} value={cardStyle === 'large' ? t('cardStyleLarge') : t('cardStyleCompact')} onPress={onToggleCardStyle} />
            <MenuRow styles={styles} label={t('mourningRibbon')} value={showRibbon ? t('on') : t('off')} active={showRibbon} onPress={onToggleRibbon} />
            <View style={styles.divider} />
            <MenuRow styles={styles} label={t('personTree')} onPress={closeThen(onPersonTree)} />
            <MenuRow styles={styles} label={t('findRelationship')} onPress={closeThen(onFindRelationship)} />
            <View style={styles.divider} />
            <MenuRow styles={styles} label={t('import')} onPress={closeThen(onImport)} />
            <MenuRow styles={styles} label={t('export')} onPress={closeThen(onExport)} />
            <View style={styles.divider} />
            <MenuRow styles={styles} label={t('help')} onPress={closeThen(onHelp)} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * `icon` (an emoji) is drawn as its own Text beside `value`, never inside
 * the same string: Android can measure a string mixing an emoji with
 * right-to-left Persian too narrow and clip it away entirely, which is how
 * the theme row's "☀️ روز" ended up blank (a real, previously-shipped bug).
 */
function MenuRow({
  label,
  value,
  icon,
  active,
  onPress,
  styles,
}: {
  label: string;
  value?: string;
  icon?: string;
  active?: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  const { isRTL } = useI18n();
  return (
    <Pressable style={({ pressed }) => [styles.row, isRTL && styles.rowRTL, pressed && styles.rowPressed]} onPress={onPress}>
      <Text style={[styles.rowLabel, isRTL && styles.textRTL]}>{label}</Text>
      {value != null && (
        <View style={[styles.rowValueWrap, isRTL && styles.rowRTL]}>
          {icon && <Text style={styles.rowIcon}>{icon}</Text>}
          <Text style={[styles.rowValue, active && styles.rowValueActive]} numberOfLines={1}>
            {value}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row' },
    backdropRTL: { flexDirection: 'row-reverse' },
    panel: { height: '100%', backgroundColor: theme.panel, borderColor: theme.stroke },
    panelLTR: { borderRightWidth: 1 },
    panelRTL: { borderLeftWidth: 1 },
    title: { color: theme.ink, fontSize: 20, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12 },
    textRTL: { writingDirection: 'rtl', textAlign: 'right' },
    list: { paddingVertical: 4 },
    divider: { height: 1, backgroundColor: theme.stroke, marginVertical: 6, marginHorizontal: 20 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    rowRTL: { flexDirection: 'row-reverse' },
    rowPressed: { backgroundColor: theme.panel2 },
    rowLabel: { color: theme.ink, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    // Never shrinks to nothing (see MenuRow), but a long value such as a
    // tree's name is capped at one line instead of crowding out the label.
    rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: '55%' },
    rowIcon: { fontSize: 14 },
    rowValue: { color: theme.inkDim, fontSize: 13, fontWeight: '600' },
    rowValueActive: { color: theme.lineMarriage },
  });
}
