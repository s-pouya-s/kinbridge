import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ID, Person } from '../types';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { PersonPicker } from './PersonPicker';

export type RelationshipSlot = 'first' | 'second';

interface Props {
  visible: boolean;
  people: Person[];
  firstId: ID | null;
  secondId: ID | null;
  onChoose: (slot: RelationshipSlot, personId: ID) => void;
  /** Closes this sheet so the person can be tapped on the tree instead; the parent reopens it after. */
  onPickOnTree: (slot: RelationshipSlot) => void;
  onShow: () => void;
  onClose: () => void;
}

/**
 * Where "Find relationship" starts: choose two people, each either by
 * searching their name or by tapping them on the tree, then show the chart
 * of how they're related (see RelationshipChart).
 */
export function RelationshipSheet({ visible, people, firstId, secondId, onChoose, onPickOnTree, onShow, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [searching, setSearching] = useState<RelationshipSlot | null>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const canShow = firstId != null && secondId != null && firstId !== secondId;

  const slot = (which: RelationshipSlot, label: string, personId: ID | null) => {
    const person = personId ? byId.get(personId) : undefined;
    return (
      <View style={styles.slot}>
        <Text style={[styles.slotLabel, isRTL && styles.textRTL]}>{label}</Text>
        <View style={[styles.chosen, !person && styles.chosenEmpty]}>
          <Text style={[person ? styles.chosenName : styles.chosenPlaceholder, isRTL && styles.textRTL]} numberOfLines={1}>
            {person ? (person.unknown ? t('unknown') : [person.name, person.surname].filter(Boolean).join(' ')) : t('noOneChosen')}
          </Text>
        </View>
        <View style={[styles.row, isRTL && styles.rowRTL]}>
          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => setSearching(which)}>
            <Text style={styles.secondaryButtonText}>{t('searchByName')}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => onPickOnTree(which)}>
            <Text style={styles.secondaryButtonText}>{t('pickOnTree')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]}>
          <Text style={[styles.title, isRTL && styles.textRTL]}>{t('findRelationship')}</Text>
          <Text style={[styles.hint, isRTL && styles.textRTL]}>{t('findRelationshipHint')}</Text>
          {slot('first', t('firstPerson'), firstId)}
          {slot('second', t('secondPerson'), secondId)}
          <Pressable style={[styles.primaryButton, !canShow && styles.disabled]} disabled={!canShow} onPress={onShow}>
            <Text style={styles.primaryButtonText}>{t('showRelationship')}</Text>
          </Pressable>
        </View>
      </View>
      <PersonPicker
        visible={searching != null}
        people={people.filter((p) => !p.unknown)}
        onClose={() => setSearching(null)}
        onSelect={(id) => {
          if (searching) onChoose(searching, id);
          setSearching(null);
        }}
      />
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
    title: { color: theme.ink, fontSize: 19, fontWeight: '700' },
    hint: { color: theme.inkDim, fontSize: 13, marginTop: 4, marginBottom: 14, lineHeight: 18 },
    textRTL: { textAlign: 'right', writingDirection: 'rtl' },
    slot: { marginBottom: 16 },
    slotLabel: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    chosen: { backgroundColor: theme.panel2, borderRadius: 12, borderWidth: 1, borderColor: theme.selected, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
    chosenEmpty: { borderColor: theme.stroke, borderStyle: 'dashed' },
    chosenName: { color: theme.ink, fontSize: 15, fontWeight: '700' },
    chosenPlaceholder: { color: theme.inkFaint, fontSize: 14 },
    row: { flexDirection: 'row', gap: 8 },
    rowRTL: { flexDirection: 'row-reverse' },
    secondaryButton: { flex: 1, borderWidth: 1, borderColor: theme.stroke, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    secondaryButtonText: { color: theme.ink, fontSize: 13.5, fontWeight: '600' },
    pressed: { opacity: 0.55 },
    primaryButton: { backgroundColor: theme.lineMarriage, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
    primaryButtonText: { color: theme.bg, fontSize: 15, fontWeight: '700' },
    disabled: { opacity: 0.4 },
  });
}
