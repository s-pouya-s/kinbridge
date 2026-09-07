import React from 'react';
import { Image, Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import type { Person } from '../types';
import { theme } from '../theme';
import { useI18n } from '../i18n';
import { formatJalali } from '../utils/jalali';

interface Props {
  person: Person | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Read-only. Nothing in this app edits a person's data from here — tapping a
 * card is for looking someone up, not changing them. An explicit edit mode
 * is a separate, later feature.
 */
export function PersonSheet({ person, visible, onClose }: Props) {
  const { t, isRTL } = useI18n();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {person && (
            <>
              <View style={[styles.header, isRTL && styles.rowRTL]}>
                {person.photoUri ? (
                  <Image source={{ uri: person.photoUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{person.unknown ? '?' : person.name.charAt(0)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, isRTL && styles.textEnd]}>
                    {person.unknown ? t('unknown') : `${person.name}${person.surname ? ' ' + person.surname : ''}`}
                  </Text>
                  {!person.unknown && (
                    <Text style={[styles.dates, isRTL && styles.textEnd]}>
                      {person.born ? `${t('bornPrefix')} ${formatJalali(person.born)}` : t('birthYearUnknown')}
                      {person.died ? ` · ${t('diedPrefix')} ${formatJalali(person.died)}` : ` · ${t('living')}`}
                    </Text>
                  )}
                </View>
              </View>

              {person.unknown ? (
                <Text style={[styles.note, isRTL && styles.textEnd]}>{t('noInfoRecorded')}</Text>
              ) : (
                <View style={styles.body}>
                  <Field label={t('placeOfBirth')} value={person.birthPlace} dash={t('dash')} isRTL={isRTL} />
                  {person.died != null && <Field label={t('placeOfBurial')} value={person.gravePlace} dash={t('dash')} isRTL={isRTL} />}
                  <Field label={t('notes')} value={person.notes} dash={t('dash')} isRTL={isRTL} multiline />
                  {!person.photoUri && <Text style={[styles.photoSlot, isRTL && styles.textEnd]}>{t('noPhoto')}</Text>}
                </View>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, dash, multiline, isRTL }: { label: string; value?: string; dash: string; multiline?: boolean; isRTL: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{label}</Text>
      <Text style={[styles.fieldValue, multiline && { lineHeight: 19 }, isRTL && styles.textEnd]}>
        {value && value.length > 0 ? value : dash}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  rowRTL: { flexDirection: 'row-reverse' },
  textEnd: { textAlign: 'right' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.nodeStroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: theme.lineMarriage, fontSize: 20, fontWeight: '700' },
  avatarImage: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.panel2 },
  name: { color: theme.ink, fontSize: 18, fontWeight: '700' },
  dates: { color: theme.inkDim, fontSize: 13, marginTop: 3 },
  body: { gap: 14 },
  field: {},
  fieldLabel: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  fieldValue: { color: theme.ink, fontSize: 14 },
  photoSlot: { color: theme.inkFaint, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  note: { color: theme.inkDim, fontSize: 14 },
});
