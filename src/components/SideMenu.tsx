import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import type { CardStyle } from '../layout/layout';
import { AVAILABLE_LOCALES } from '../i18n';
import { localeInfo, type Locale } from '../i18n/locales';

interface Props {
  visible: boolean;
  onClose: () => void;
  editMode: boolean;
  onToggleEditMode: () => void;
  /** Switches the app to this language. */
  onSetLocale: (locale: Locale) => void;
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
  onExportPdf: () => void;
}

/**
 * Every app-wide action and setting, behind the header's ☰ button. Slides in
 * from the same (start) edge the ☰ sits on, so it's the right edge in
 * Persian and the left in English.
 *
 * Actions that change what's on screen (edit mode)
 * or open something else (help, a person's tree, find relationship, import, export, PDF) close the menu
 * first, so the result is visible right away and no two Modals are ever
 * stacked. Language, theme, the map, the card style and the ribbon leave it open, since the menu itself is where
 * that change shows up first.
 */
export function SideMenu({
  visible,
  onClose,
  editMode,
  onToggleEditMode,
  onSetLocale,
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
  onExportPdf,
}: Props) {
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const { t, isRTL, locale } = useI18n();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const panelWidth = Math.min(300, window.width * 0.8);

  // Slides in from its own edge with a plain transform, not a Reanimated
  // `entering` animation: that one copies the view's size when it first
  // lays out, and a Modal first lays out without the system bars (750 of an
  // 832-tall screen here), only growing to full height a moment later, so
  // the panel stayed short of the bottom of the screen (a real, previously-
  // shipped bug, measured on a device).
  const slide = useSharedValue(1);
  useEffect(() => {
    if (!visible) return;
    slide.value = 1;
    slide.value = withTiming(0, { duration: 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value * (isRTL ? 1 : -1) * (panelWidth + 40) }] }));

  const closeThen = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, isRTL && styles.backdropRTL]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('closeMenu')} />
        <Animated.View
          style={[
            slideStyle,
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
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
            <MenuRow
              styles={styles}
              label={t('editMode')}
              value={editMode ? t('on') : t('off')}
              active={editMode}
              onPress={closeThen(onToggleEditMode)}
            />
            <View style={styles.divider} />
            {/* Each language is named in itself, not translated, so someone
                who can't read the current one can still find their own. The
                list opens right here in the menu, so no second pop-up stacks
                on top of it. */}
            <MenuRow
              styles={styles}
              label={t('language')}
              value={localeInfo(locale).nativeName}
              trailing={languagesOpen ? '▴' : '▾'}
              onPress={() => setLanguagesOpen((open) => !open)}
            />
            {/* Its own tinted box, so the list stands apart from the menu around it. */}
            {languagesOpen && (
              <View style={styles.subList}>
                {AVAILABLE_LOCALES.map((l) => (
                  <MenuRow
                    key={l.code}
                    styles={styles}
                    nested
                    label={l.nativeName}
                    value={l.code === locale ? '✓' : ''}
                    active={l.code === locale}
                    onPress={() => {
                      setLanguagesOpen(false);
                      if (l.code !== locale) onSetLocale(l.code);
                    }}
                  />
                ))}
              </View>
            )}
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
            <MenuRow styles={styles} label={t('exportPdf')} onPress={closeThen(onExportPdf)} />
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
  trailing,
  active,
  nested,
  onPress,
  styles,
}: {
  label: string;
  value?: string;
  icon?: string;
  /** A small mark after the value, such as ▾ for a row that opens a list. Its own Text, never mixed into Persian text. */
  trailing?: string;
  active?: boolean;
  /** A row inside a sub-list (see subList): pressing fades it instead of tinting, since the list is already tinted. */
  nested?: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  const { isRTL } = useI18n();
  return (
    <Pressable style={({ pressed }) => [styles.row, isRTL && styles.rowRTL, pressed && (nested ? styles.rowPressedNested : styles.rowPressed)]} onPress={onPress}>
      <Text style={[styles.rowLabel, isRTL && styles.textRTL]}>{label}</Text>
      {value != null && (
        <View style={[styles.rowValueWrap, isRTL && styles.rowRTL]}>
          {icon && <Text style={styles.rowIcon}>{icon}</Text>}
          <Text style={[styles.rowValue, active && styles.rowValueActive]} numberOfLines={1}>
            {value}
          </Text>
          {trailing && <Text style={styles.rowTrailing}>{trailing}</Text>}
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
    // Pinned to the screen's top and bottom edges rather than height: '100%',
    // which depends on the backdrop's height being settled when it's first
    // measured; under the slide-in animation it wasn't, and the panel ended
    // wherever its own rows did, partway down the screen.
    panel: { position: 'absolute', top: 0, bottom: 0, backgroundColor: theme.panel, borderColor: theme.stroke },
    panelLTR: { left: 0, borderRightWidth: 1 },
    panelRTL: { right: 0, borderLeftWidth: 1 },
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
    rowPressedNested: { opacity: 0.6 },
    rowTrailing: { color: theme.inkDim, fontSize: 13 },
    // The language list: a tinted, slightly indented box under its row.
    subList: { backgroundColor: theme.panel2, borderRadius: 12, marginHorizontal: 10, marginBottom: 6, paddingVertical: 4, overflow: 'hidden' },
    rowLabel: { color: theme.ink, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    // Never shrinks to nothing (see MenuRow), but a long value such as a
    // tree's name is capped at one line instead of crowding out the label.
    rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: '55%' },
    rowIcon: { fontSize: 14 },
    rowValue: { color: theme.inkDim, fontSize: 13, fontWeight: '600' },
    rowValueActive: { color: theme.lineMarriage },
  });
}
