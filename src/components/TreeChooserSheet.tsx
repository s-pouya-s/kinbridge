import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';

export interface ChooserItem {
  key: string;
  name: string;
  detail?: string;
}

interface Props {
  visible: boolean;
  title: string;
  hint: string;
  items: ChooserItem[];
  /** Ticked when the sheet opens. */
  initiallySelected: string[];
  /** The button's text, given how many are ticked. */
  actionLabel: (count: number) => string;
  onConfirm: (keys: string[]) => void;
  onClose: () => void;
}

/**
 * Tick which family trees to act on: which ones to put in an export file, or
 * which of a file's trees to import. The action button stays disabled until
 * at least one is ticked, and "select all" toggles the lot.
 */
export function TreeChooserSheet({ visible, title, hint, items, initiallySelected, actionLabel, onConfirm, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set(initiallySelected));

  useEffect(() => {
    if (visible) setSelected(new Set(initiallySelected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.key));
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]}>
          <Text style={[styles.title, isRTL && styles.textRTL]}>{title}</Text>
          <Text style={[styles.hint, isRTL && styles.textRTL]}>{hint}</Text>

          {items.length > 1 && (
            <Pressable
              style={[styles.selectAll, isRTL && styles.selectAllRTL]}
              onPress={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.key)))}
              hitSlop={6}
            >
              <Text style={styles.selectAllText}>{allSelected ? t('selectNone') : t('selectAll')}</Text>
            </Pressable>
          )}

          <ScrollView style={styles.list}>
            {items.map((item) => {
              const on = selected.has(item.key);
              return (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, isRTL && styles.rowRTL, pressed && styles.pressed]}
                  onPress={() => toggle(item.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.mark}>✓</Text>}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, isRTL && styles.textRTL]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.detail && <Text style={[styles.detail, isRTL && styles.textRTL]}>{item.detail}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            style={[styles.primaryButton, selected.size === 0 && styles.disabled]}
            disabled={selected.size === 0}
            onPress={() => onConfirm(items.filter((i) => selected.has(i.key)).map((i) => i.key))}
          >
            <Text style={styles.primaryButtonText}>{actionLabel(selected.size)}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
    title: { color: theme.ink, fontSize: 19, fontWeight: '700' },
    hint: { color: theme.inkDim, fontSize: 13, marginTop: 4, marginBottom: 10, lineHeight: 18 },
    textRTL: { textAlign: 'right', writingDirection: 'rtl' },
    selectAll: { alignSelf: 'flex-end', paddingVertical: 4, marginBottom: 6 },
    selectAllRTL: { alignSelf: 'flex-start' },
    selectAllText: { color: theme.lineMarriage, fontSize: 13, fontWeight: '700' },
    list: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.panel2,
      borderWidth: 1,
      borderColor: theme.stroke,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    rowOn: { borderColor: theme.lineMarriage },
    rowRTL: { flexDirection: 'row-reverse' },
    box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: theme.stroke, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel },
    boxOn: { backgroundColor: theme.lineMarriage, borderColor: theme.lineMarriage },
    mark: { color: theme.bg, fontSize: 15, fontWeight: '800', lineHeight: 17 },
    name: { color: theme.ink, fontSize: 15, fontWeight: '700' },
    detail: { color: theme.inkDim, fontSize: 12, marginTop: 2 },
    primaryButton: { backgroundColor: theme.lineMarriage, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
    primaryButtonText: { color: theme.bg, fontSize: 15, fontWeight: '700' },
    disabled: { opacity: 0.4 },
    cancel: { paddingVertical: 12, alignItems: 'center' },
    cancelText: { color: theme.inkDim, fontSize: 14, fontWeight: '600' },
    pressed: { opacity: 0.6 },
  });
}
