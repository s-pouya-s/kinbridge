import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { Marriage, Person } from '../types';
import { theme } from '../theme';
import { useI18n } from '../i18n';

interface Props {
  visible: boolean;
  title: string;
  /** Already filtered to sensible candidates by the caller (e.g. not a marriage this person is already part of). */
  marriages: Marriage[];
  people: Person[];
  onSelect: (marriageId: string) => void;
  onClose: () => void;
}

/**
 * A searchable list of existing marriages, each labeled by its two spouses —
 * for linking a person into a couple that's already in the tree (e.g. "+
 * Existing parents") instead of always creating two new people.
 */
export function MarriagePicker({ visible, title, marriages, people, onSelect, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const label = (m: Marriage) => {
    const name = (id: string) => {
      const p = byId.get(id);
      if (!p) return t('unknown');
      return p.unknown ? t('unknown') : [p.name, p.surname].filter(Boolean).join(' ');
    };
    return `${name(m.spouseIds[0])} ${t('and')} ${name(m.spouseIds[1])}`;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return marriages;
    return marriages.filter((m) => label(m).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marriages, query, byId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, isRTL && styles.textEnd]}>{title}</Text>
          <TextInput
            style={[styles.search, isRTL && styles.textEnd]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchPeople')}
            placeholderTextColor={theme.inkFaint}
          />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && <Text style={[styles.emptyHint, isRTL && styles.textEnd]}>{t('noMatchingPeople')}</Text>}
            {filtered.map((m) => (
              <Pressable key={m.id} style={styles.row} onPress={() => onSelect(m.id)}>
                <Text style={[styles.rowName, isRTL && styles.textEnd]}>{label(m)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '80%' },
  title: { color: theme.ink, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  textEnd: { textAlign: 'right' },
  search: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.ink,
    fontSize: 14,
    marginBottom: 10,
  },
  list: { marginBottom: 4 },
  emptyHint: { color: theme.inkFaint, fontSize: 12.5, paddingVertical: 10 },
  row: {
    backgroundColor: theme.panel2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowName: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  cancelButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelButtonText: { color: theme.inkFaint, fontSize: 13 },
});
