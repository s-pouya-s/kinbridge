import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Gender, ID, Marriage, Person } from '../types';
import { theme } from '../theme';
import { useI18n } from '../i18n';
import { formatJalali } from '../utils/jalali';
import { pickPersonPhoto } from '../utils/photo';
import { ShamsiDatePicker } from './ShamsiDatePicker';
import { PersonPicker } from './PersonPicker';
import { MarriagePicker } from './MarriagePicker';

interface Props {
  person: Person | null;
  /** Full roster, for the "+ Existing person"/"+ Existing parents" pickers — filtered down to sensible candidates here, not by the caller. */
  people: Person[];
  /** Full marriage list, to tell whether this person already has parents recorded and to offer as "+ Existing parents" candidates. */
  marriages: Marriage[];
  visible: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Person>) => void;
  /** The parent is responsible for confirming with the user — this fires only once that's done. */
  onDelete: () => void;
  onAddSpouse: () => void;
  /** Marries this person to someone already in the tree instead of creating a new one. */
  onAddExistingSpouse: (existingPersonId: ID) => void;
  /** Creates two new people, married to each other, as this person's parents. Only offered while they have none recorded yet. */
  onAddParents: () => void;
  /** Attaches this person as a child of an existing marriage instead of creating new parents. */
  onAddExistingParents: (marriageId: ID) => void;
  /** Clears any manual drag-reorder and any arrow-opened gaps for this person's whole row, back to the automatic order. Applies immediately. */
  onResetOrder: () => void;
}

/**
 * The editable counterpart to PersonSheet. Only reachable while edit mode is
 * on (TreeCanvas routes taps here instead of the read-only sheet).
 */
export function PersonEditSheet({
  person,
  people,
  marriages,
  visible,
  onClose,
  onSave,
  onDelete,
  onAddSpouse,
  onAddExistingSpouse,
  onAddParents,
  onAddExistingParents,
  onResetOrder,
}: Props) {
  const { t, isRTL } = useI18n();
  const [spousePickerOpen, setSpousePickerOpen] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [born, setBorn] = useState<string | undefined>(undefined);
  const [died, setDied] = useState<string | undefined>(undefined);
  const [birthPlace, setBirthPlace] = useState('');
  const [gravePlace, setGravePlace] = useState('');
  const [notes, setNotes] = useState('');
  const [activePicker, setActivePicker] = useState<'born' | 'died' | null>(null);

  useEffect(() => {
    if (!person || !visible) return;
    setName(person.name ?? '');
    setSurname(person.surname ?? '');
    setGender(person.gender);
    setPhoto(person.photoUri);
    setBorn(person.born);
    setDied(person.died);
    setBirthPlace(person.birthPlace ?? '');
    setGravePlace(person.gravePlace ?? '');
    setNotes(person.notes ?? '');
  }, [person, visible]);

  if (!person) return null;

  const nameValid = name.trim().length > 0;
  const inputStyle = [styles.input, isRTL && styles.textEnd];
  const alreadyHasParents = marriages.some((m) => m.childIds.includes(person.id));
  const parentCandidates = marriages.filter((m) => !m.spouseIds.includes(person.id) && !m.childIds.includes(person.id));

  const handleChoosePhoto = async () => {
    const uri = await pickPersonPhoto(t);
    if (uri) setPhoto(uri);
  };

  const handleSave = () => {
    if (!nameValid) return;
    onSave({
      name: name.trim(),
      surname: surname.trim() || undefined,
      gender,
      photoUri: photo,
      born,
      died,
      birthPlace: birthPlace.trim() || undefined,
      // No death date -> no burial place, even if one was entered before they were (incorrectly) marked as deceased.
      gravePlace: died ? gravePlace.trim() || undefined : undefined,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, isRTL && styles.textEnd]}>{t('editPerson')}</Text>

            <Field label={t('nameRequired')} isRTL={isRTL}>
              <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder={t('name')} placeholderTextColor={theme.inkFaint} />
            </Field>
            <Field label={t('surname')} isRTL={isRTL}>
              <TextInput style={inputStyle} value={surname} onChangeText={setSurname} placeholder={t('surname')} placeholderTextColor={theme.inkFaint} />
            </Field>

            <Field label={t('gender')} isRTL={isRTL}>
              <View style={[styles.segmented, isRTL && styles.rowRTL]}>
                <SegButton label={t('male')} active={gender === 'male'} onPress={() => setGender(gender === 'male' ? undefined : 'male')} accent={theme.maleStroke} />
                <SegButton label={t('female')} active={gender === 'female'} onPress={() => setGender(gender === 'female' ? undefined : 'female')} accent={theme.femaleStroke} />
              </View>
            </Field>

            <Field label={t('photo')} isRTL={isRTL}>
              <View style={[styles.photoRow, isRTL && styles.rowRTL]}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder} />
                )}
                <View style={{ flex: 1, gap: 8 }}>
                  <Pressable style={[styles.secondaryButton, { marginTop: 0 }]} onPress={handleChoosePhoto}>
                    <Text style={styles.secondaryButtonText}>{photo ? t('changePhoto') : t('choosePhoto')}</Text>
                  </Pressable>
                  {photo && (
                    <Pressable onPress={() => setPhoto(undefined)}>
                      <Text style={styles.resetLink}>{t('removePhoto')}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </Field>

            {/* Birth and death each get their own column — date on top, place
                directly under its own date, rather than every date first and
                every place afterward. */}
            <View style={[styles.row, isRTL && styles.rowRTL]}>
              <View style={{ flex: 1 }}>
                <Field label={t('bornYear')} isRTL={isRTL}>
                  <Pressable style={styles.dateField} onPress={() => setActivePicker('born')}>
                    <Text style={[styles.dateFieldText, !born && styles.dateFieldPlaceholder, isRTL && styles.textEnd]}>
                      {born ? formatJalali(born) : t('selectDate')}
                    </Text>
                  </Pressable>
                </Field>
                <Field label={t('placeOfBirth')} isRTL={isRTL}>
                  <TextInput style={inputStyle} value={birthPlace} onChangeText={setBirthPlace} placeholder={t('cityPlaceholder')} placeholderTextColor={theme.inkFaint} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t('diedYear')} isRTL={isRTL}>
                  <Pressable style={styles.dateField} onPress={() => setActivePicker('died')}>
                    <Text style={[styles.dateFieldText, !died && styles.dateFieldPlaceholder, isRTL && styles.textEnd]}>
                      {died ? formatJalali(died) : t('selectDate')}
                    </Text>
                  </Pressable>
                  {!died && <Text style={[styles.hint, isRTL && styles.textEnd]}>{t('livingNoDeathDate')}</Text>}
                </Field>
                {died && (
                  <Field label={t('placeOfBurial')} isRTL={isRTL}>
                    <TextInput style={inputStyle} value={gravePlace} onChangeText={setGravePlace} placeholder={t('cemeteryPlaceholder')} placeholderTextColor={theme.inkFaint} />
                  </Field>
                )}
              </View>
            </View>

            <ShamsiDatePicker
              visible={activePicker === 'born'}
              title={t('bornYear')}
              value={born}
              onClose={() => setActivePicker(null)}
              onChange={setBorn}
            />
            <ShamsiDatePicker
              visible={activePicker === 'died'}
              title={t('diedYear')}
              value={died}
              onClose={() => setActivePicker(null)}
              onChange={setDied}
            />
            <Field label={t('notes')} isRTL={isRTL}>
              <TextInput
                style={[...inputStyle, styles.inputMultiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('notesPlaceholder')}
                placeholderTextColor={theme.inkFaint}
                multiline
              />
            </Field>

            <Field label={t('position')} isRTL={isRTL}>
              {/* Reordering and spacing both live on the tree itself now (the
                  ‹ › arrows in edit mode) — this is just the escape hatch back
                  to "let the algorithm decide" for this person's whole row. */}
              <Text style={styles.hint}>{t('positionHint')}</Text>
              <Pressable onPress={onResetOrder} style={{ marginTop: 8 }}>
                <Text style={styles.resetLink}>{t('resetOrder')}</Text>
              </Pressable>
            </Field>

            <Pressable style={[styles.primaryButton, !nameValid && styles.buttonDisabled]} disabled={!nameValid} onPress={handleSave}>
              <Text style={styles.primaryButtonText}>{t('save')}</Text>
            </Pressable>

            <Field label={t('parents')} isRTL={isRTL}>
              {alreadyHasParents ? (
                <Text style={[styles.hint, isRTL && styles.textEnd]}>{t('parentsAlreadySet')}</Text>
              ) : (
                <View style={[styles.row, isRTL && styles.rowRTL]}>
                  <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={onAddParents}>
                    <Text style={styles.secondaryButtonText}>{t('addParents')}</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setParentPickerOpen(true)}>
                    <Text style={styles.secondaryButtonText}>{t('linkExistingParents')}</Text>
                  </Pressable>
                </View>
              )}
            </Field>

            <View style={[styles.row, isRTL && styles.rowRTL]}>
              <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={onAddSpouse}>
                <Text style={styles.secondaryButtonText}>{t('addSpouse')}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setSpousePickerOpen(true)}>
                <Text style={styles.secondaryButtonText}>{t('linkExistingPerson')}</Text>
              </Pressable>
            </View>

            <Pressable style={styles.dangerButton} onPress={onDelete}>
              <Text style={styles.dangerButtonText}>{t('deletePerson')}</Text>
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <PersonPicker
        visible={spousePickerOpen}
        people={people.filter((p) => p.id !== person.id)}
        onClose={() => setSpousePickerOpen(false)}
        onSelect={(existingId) => {
          setSpousePickerOpen(false);
          onAddExistingSpouse(existingId);
        }}
      />

      <MarriagePicker
        visible={parentPickerOpen}
        title={t('selectParents')}
        marriages={parentCandidates}
        people={people}
        onClose={() => setParentPickerOpen(false)}
        onSelect={(marriageId) => {
          setParentPickerOpen(false);
          onAddExistingParents(marriageId);
        }}
      />
    </Modal>
  );
}

function Field({ label, children, style, isRTL }: { label: string; children: React.ReactNode; style?: object; isRTL: boolean }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{label}</Text>
      {children}
    </View>
  );
}

function SegButton({ label, active, onPress, accent }: { label: string; active: boolean; onPress: () => void; accent: string }) {
  return (
    <Pressable style={[styles.segButton, active && { borderColor: accent, backgroundColor: accent + '22' }]} onPress={onPress}>
      <Text style={[styles.segButtonText, active && { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '88%' },
  title: { color: theme.ink, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12 },
  rowRTL: { flexDirection: 'row-reverse' },
  textEnd: { textAlign: 'right' },
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
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  dateField: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateFieldText: { color: theme.ink, fontSize: 14 },
  dateFieldPlaceholder: { color: theme.inkFaint },
  photoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photoPreview: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.panel2 },
  photoPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.panel2, borderWidth: 1, borderColor: theme.stroke, borderStyle: 'dashed' },
  segmented: { flexDirection: 'row', gap: 8 },
  segButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: theme.panel2,
  },
  segButtonText: { color: theme.inkDim, fontSize: 13, fontWeight: '600' },
  primaryButton: { backgroundColor: theme.lineMarriage, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  primaryButtonText: { color: theme.bg, fontSize: 14, fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: theme.stroke, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  secondaryButtonText: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  dangerButton: { borderWidth: 1, borderColor: theme.lineEnded, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  dangerButtonText: { color: theme.lineEnded, fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  hint: { color: theme.inkFaint, fontSize: 11.5, marginTop: 6, textAlign: 'center' },
  resetLink: { color: theme.lineMarriage, fontSize: 11.5, textAlign: 'center', fontWeight: '600' },
  cancelButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelButtonText: { color: theme.inkFaint, fontSize: 13 },
});
