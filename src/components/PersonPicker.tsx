import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Person } from '../types';
import { theme } from '../theme';
import { useI18n } from '../i18n';
import { formatJalali } from '../utils/jalali';

interface Props {
  visible: boolean;
  /** Already filtered to sensible candidates by the caller (e.g. not the person themselves) — this just searches and lists them. */
  people: Person[];
  onSelect: (personId: string) => void;
  onClose: () => void;
}

/**
 * A searchable list of existing people, for linking one into a new role
 * (spouse, child) instead of always creating a brand-new person — the
 * escape hatch for when that person already exists somewhere else in the
 * tree (a cousin marriage, or two separately-started trees meeting).
 */
export function PersonPicker({ visible, people, onSelect, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => !p.unknown && `${p.name} ${p.surname ?? ''}`.toLowerCase().includes(q));
  }, [people, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, isRTL && styles.textEnd]}>{t('selectPerson')}</Text>
          <TextInput
            style={[styles.search, isRTL && styles.textEnd]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchPeople')}
            placeholderTextColor={theme.inkFaint}
          />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && <Text style={[styles.emptyHint, isRTL && styles.textEnd]}>{t('noMatchingPeople')}</Text>}
            {filtered.map((p) => (
              <Pressable key={p.id} style={[styles.row, isRTL && styles.rowRTL]} onPress={() => onSelect(p.id)}>
                <Text style={[styles.rowName, isRTL && styles.textEnd]}>{p.unknown ? t('unknown') : [p.name, p.surname].filter(Boolean).join(' ')}</Text>
                <Text style={[styles.rowMeta, isRTL && styles.textEnd]}>{p.born ? `${t('bornPrefix')} ${formatJalali(p.born)}` : t('birthYearUnknown')}</Text>
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
  rowRTL: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.panel2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowName: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: theme.inkFaint, fontSize: 11.5 },
  cancelButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelButtonText: { color: theme.inkFaint, fontSize: 13 },
});
