import React, { useMemo } from 'react';
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import type { Marriage, Person } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';

interface Props {
  marriage: Marriage | null;
  people: Person[];
  visible: boolean;
  onClose: () => void;
}

/**
 * Read-only, same as PersonSheet — tapping a marriage's ⊕ shows its dates,
 * it doesn't open anything editable.
 */
export function MarriageSheet({ marriage, people, visible, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // Modals draw edge-to-edge too, so the sheet adds the system bars' own
  // insets itself — otherwise its last row sits under the back/home bar.
  const insets = useSafeAreaInsets();
  const byId = new Map(people.map((p) => [p.id, p]));
  const spouseA = marriage ? byId.get(marriage.spouseIds[0]) : undefined;
  const spouseB = marriage ? byId.get(marriage.spouseIds[1]) : undefined;

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { paddingTop: insets.top }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: 16 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]} onPress={(e) => e.stopPropagation()}>
          {marriage && spouseA && spouseB && (
            <>
              <View style={[styles.header, isRTL && styles.rowRTL]}>
                <View style={[styles.mark, { borderColor: marriage.status === 'current' ? theme.lineMarriage : theme.lineEnded }]}>
                  <Text style={[styles.markText, { color: marriage.status === 'current' ? theme.lineMarriage : theme.lineEnded }]}>⊕</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, isRTL && styles.textEnd]}>
                    {spouseA.unknown ? t('unknown') : spouseA.name} {t('and')} {spouseB.unknown ? t('unknown') : spouseB.name}
                  </Text>
                  <Text style={[styles.status, isRTL && styles.textEnd, { color: marriage.status === 'current' ? theme.lineMarriage : theme.lineEnded }]}>
                    {marriage.status === 'current' ? t('currentMarriage') : t('endedMarriage')}
                  </Text>
                </View>
              </View>

              <View style={styles.body}>
                <Field styles={styles} label={t('married')} value={marriage.marriedYear != null ? String(marriage.marriedYear) : t('yearUnknown')} isRTL={isRTL} />
                {marriage.status === 'ended' && (
                  <Field styles={styles} label={t('divorced')} value={marriage.endedYear != null ? String(marriage.endedYear) : t('yearUnknown')} isRTL={isRTL} />
                )}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, isRTL, styles }: { label: string; value?: string; isRTL: boolean; styles: Styles }) {
  return (
    <View>
      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{label}</Text>
      <Text style={[styles.fieldValue, isRTL && styles.textEnd]}>{value ?? '—'}</Text>
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  rowRTL: { flexDirection: 'row-reverse' },
  textEnd: { textAlign: 'right', writingDirection: 'rtl' },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    backgroundColor: theme.panel2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontSize: 18, fontWeight: '700' },
  name: { color: theme.ink, fontSize: 17, fontWeight: '700' },
  status: { fontSize: 12.5, marginTop: 3, fontWeight: '600' },
  body: { gap: 14 },
  fieldLabel: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  fieldValue: { color: theme.ink, fontSize: 14 },
  });
}
