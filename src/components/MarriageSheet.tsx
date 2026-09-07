import React from 'react';
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import type { Marriage, Person } from '../types';
import { getMarriageOrdinal } from '../types';
import { theme } from '../theme';
import { formatOrdinal, useI18n } from '../i18n';

interface Props {
  marriage: Marriage | null;
  people: Person[];
  allMarriages: Marriage[];
  visible: boolean;
  onClose: () => void;
}

/**
 * Read-only, same as PersonSheet — tapping a marriage's ⊕ shows its dates,
 * it doesn't open anything editable.
 */
export function MarriageSheet({ marriage, people, allMarriages, visible, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const byId = new Map(people.map((p) => [p.id, p]));
  const spouseA = marriage ? byId.get(marriage.spouseIds[0]) : undefined;
  const spouseB = marriage ? byId.get(marriage.spouseIds[1]) : undefined;

  const marriageLabelFor = (personId: string) => {
    if (!marriage) return '';
    if (marriage.labelOverride) return marriage.labelOverride;
    return t('marriageOrdinal', { ordinal: formatOrdinal(t, getMarriageOrdinal(marriage, personId, allMarriages)) });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
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
                <Field label={t('married')} value={marriage.marriedYear != null ? String(marriage.marriedYear) : t('yearUnknown')} isRTL={isRTL} />
                {marriage.status === 'ended' && (
                  <Field label={t('divorced')} value={marriage.endedYear != null ? String(marriage.endedYear) : t('yearUnknown')} isRTL={isRTL} />
                )}
                {!spouseA.unknown && <Field label={t('forPerson', { name: spouseA.name })} value={marriageLabelFor(spouseA.id)} isRTL={isRTL} />}
                {!spouseB.unknown && <Field label={t('forPerson', { name: spouseB.name })} value={marriageLabelFor(spouseB.id)} isRTL={isRTL} />}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, isRTL }: { label: string; value?: string; isRTL: boolean }) {
  return (
    <View>
      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{label}</Text>
      <Text style={[styles.fieldValue, isRTL && styles.textEnd]}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  rowRTL: { flexDirection: 'row-reverse' },
  textEnd: { textAlign: 'right' },
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
