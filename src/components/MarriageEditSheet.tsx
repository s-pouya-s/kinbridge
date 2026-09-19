import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ID, Marriage, MarriageStatus, Person } from '../types';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { PersonPicker } from './PersonPicker';

interface Props {
  marriage: Marriage | null;
  people: Person[];
  visible: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Omit<Marriage, 'id' | 'spouseIds' | 'childIds'>>) => void;
  onDelete: () => void;
  onAddChild: () => void;
  /** Adds someone already in the tree as a child of this marriage instead of creating a new one. */
  onAddExistingChild: (existingPersonId: ID) => void;
  onRemoveChild: (childId: string) => void;
}

export function MarriageEditSheet({ marriage, people, visible, canDelete, onClose, onSave, onDelete, onAddChild, onAddExistingChild, onRemoveChild }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [status, setStatus] = useState<MarriageStatus>('current');
  const [marriedYear, setMarriedYear] = useState('');
  const [endedYear, setEndedYear] = useState('');

  useEffect(() => {
    if (!marriage || !visible) return;
    setStatus(marriage.status);
    setMarriedYear(marriage.marriedYear != null ? String(marriage.marriedYear) : '');
    setEndedYear(marriage.endedYear != null ? String(marriage.endedYear) : '');
  }, [marriage, visible]);

  if (!marriage) return null;
  const byId = new Map(people.map((p) => [p.id, p]));
  const inputStyle = [styles.input, isRTL && styles.textEnd];

  const handleSave = () => {
    onSave({
      status,
      marriedYear: marriedYear.trim() ? Number(marriedYear.trim()) : undefined,
      endedYear: status === 'ended' && endedYear.trim() ? Number(endedYear.trim()) : undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Sibling, not wrapping, Pressable for backdrop-dismiss — see PersonSheet's
          comment on why nesting the ScrollView inside a Pressable made scrolling
          fight the backdrop for touch-responder status. */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Field styles={styles} label={t('status')} isRTL={isRTL}>
              <View style={[styles.segmented, isRTL && styles.rowRTL]}>
                <SegButton styles={styles} label={t('current')} active={status === 'current'} onPress={() => setStatus('current')} accent={theme.lineMarriage} />
                <SegButton styles={styles} label={t('ended')} active={status === 'ended'} onPress={() => setStatus('ended')} accent={theme.lineEnded} />
              </View>
            </Field>

            <View style={[styles.row, isRTL && styles.rowRTL]}>
              <Field styles={styles} label={t('marriedYear')} isRTL={isRTL} style={{ flex: 1 }}>
                <TextInput style={inputStyle} value={marriedYear} onChangeText={setMarriedYear} placeholder={t('marriedPlaceholder')} placeholderTextColor={theme.inkFaint} keyboardType="number-pad" />
              </Field>
              {status === 'ended' && (
                <Field styles={styles} label={t('divorcedYear')} isRTL={isRTL} style={{ flex: 1 }}>
                  <TextInput style={inputStyle} value={endedYear} onChangeText={setEndedYear} placeholder={t('divorcedPlaceholder')} placeholderTextColor={theme.inkFaint} keyboardType="number-pad" />
                </Field>
              )}
            </View>

            <Field styles={styles} label={t('children', { count: marriage.childIds.length })} isRTL={isRTL}>
              {marriage.childIds.length === 0 && <Text style={[styles.emptyHint, isRTL && styles.textEnd]}>{t('noChildrenYet')}</Text>}
              {marriage.childIds.map((childId) => {
                const child = byId.get(childId);
                return (
                  <View key={childId} style={[styles.childRow, isRTL && styles.rowRTL]}>
                    <Text style={styles.childName}>{child?.name ?? t('unknown')}</Text>
                    <Pressable onPress={() => onRemoveChild(childId)}>
                      <Text style={styles.childRemove}>{t('remove')}</Text>
                    </Pressable>
                  </View>
                );
              })}
              <View style={[styles.row, isRTL && styles.rowRTL]}>
                <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={onAddChild}>
                  <Text style={styles.secondaryButtonText}>{t('createPerson')}</Text>
                </Pressable>
                <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setChildPickerOpen(true)}>
                  <Text style={styles.secondaryButtonText}>{t('selectExistingPerson')}</Text>
                </Pressable>
              </View>
            </Field>

            <Pressable style={styles.primaryButton} onPress={handleSave}>
              <Text style={styles.primaryButtonText}>{t('save')}</Text>
            </Pressable>

            <Pressable style={[styles.dangerButton, !canDelete && styles.buttonDisabled]} disabled={!canDelete} onPress={onDelete}>
              <Text style={styles.dangerButtonText}>{t('deleteMarriage')}</Text>
            </Pressable>
            {!canDelete && <Text style={[styles.hint, isRTL && styles.textEnd]}>{t('deleteMarriageHint')}</Text>}

            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      <PersonPicker
        visible={childPickerOpen}
        people={people.filter((p) => p.id !== marriage.spouseIds[0] && p.id !== marriage.spouseIds[1] && !marriage.childIds.includes(p.id))}
        onClose={() => setChildPickerOpen(false)}
        onSelect={(existingId) => {
          setChildPickerOpen(false);
          onAddExistingChild(existingId);
        }}
      />
    </Modal>
  );
}

function Field({
  label,
  children,
  style,
  isRTL,
  styles,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
  isRTL: boolean;
  styles: Styles;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{label}</Text>
      {children}
    </View>
  );
}

function SegButton({
  label,
  active,
  onPress,
  accent,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: string;
  styles: Styles;
}) {
  return (
    <Pressable style={[styles.segButton, active && { borderColor: accent, backgroundColor: accent + '22' }]} onPress={onPress}>
      <Text style={[styles.segButtonText, active && { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '88%' },
  row: { flexDirection: 'row', gap: 12 },
  rowRTL: { flexDirection: 'row-reverse' },
  textEnd: { textAlign: 'right', writingDirection: 'rtl' },
  field: { marginBottom: 14 },
  fieldLabel: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.ink,
    fontSize: 14,
  },
  segmented: { flexDirection: 'row', gap: 8 },
  segButton: { flex: 1, borderWidth: 1, borderColor: theme.stroke, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: theme.panel2 },
  segButtonText: { color: theme.inkDim, fontSize: 13, fontWeight: '600' },
  emptyHint: { color: theme.inkFaint, fontSize: 12.5, marginBottom: 8 },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.panel2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
  },
  childName: { color: theme.ink, fontSize: 13.5 },
  childRemove: { color: theme.lineEnded, fontSize: 12.5, fontWeight: '600' },
  primaryButton: { backgroundColor: theme.lineMarriage, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  primaryButtonText: { color: theme.bg, fontSize: 14, fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: theme.stroke, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  secondaryButtonText: { color: theme.ink, fontSize: 13.5, fontWeight: '600' },
  dangerButton: { borderWidth: 1, borderColor: theme.lineEnded, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  dangerButtonText: { color: theme.lineEnded, fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  hint: { color: theme.inkFaint, fontSize: 11.5, marginTop: 6, textAlign: 'center' },
  cancelButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelButtonText: { color: theme.inkFaint, fontSize: 13 },
  });
}
