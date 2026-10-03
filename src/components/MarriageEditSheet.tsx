import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ID, Marriage, MarriageStatus, Person } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersonPicker } from './PersonPicker';
import { groupsOf, orderedChildIds } from '../layout/siblings';
import { DraggableChildList } from './DraggableChildList';
import { canBeChildOf } from '../model/mutations';
import { marriageYearForDisplay, marriageYearForStorage } from '../utils/calendar';
import { toAsciiDigits } from '../i18n/locales';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';

interface Props {
  marriage: Marriage | null;
  people: Person[];
  /** Every marriage in the tree, to keep the child picker to people who can be this couple's child (see canBeChildOf). */
  marriages: Marriage[];
  visible: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Omit<Marriage, 'id' | 'spouseIds' | 'childIds'>>) => void;
  onDelete: () => void;
  onAddChild: () => void;
  /** Adds someone already in the tree as a child of this marriage instead of creating a new one. */
  onAddExistingChild: (existingPersonId: ID) => void;
  onRemoveChild: (childId: string) => void;
  /** Every child's id in a new, hand-set order, oldest first. */
  onReorderChildren: (ids: string[]) => void;
  /** Back to sorting the children by birth date. */
  onResetChildOrder: () => void;
  /** Links or unlinks two neighboring children as born together (twins, triplets, ...). */
  onToggleBornTogether: (aId: string, bId: string) => void;
}

export function MarriageEditSheet({ marriage, people, marriages: allMarriages, visible, canDelete, onClose, onSave, onDelete, onAddChild, onAddExistingChild, onRemoveChild, onReorderChildren, onResetChildOrder, onToggleBornTogether }: Props) {
  const { t, isRTL, locale } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // Modals draw edge-to-edge too, so the sheet adds the system bars' own
  // insets itself — otherwise its last row sits under the back/home bar.
  const insets = useSafeAreaInsets();
  // Lifts the sheet above the on-screen keyboard (see useKeyboardHeight).
  const keyboardHeight = useKeyboardHeight();
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [status, setStatus] = useState<MarriageStatus>('current');
  const [marriedYear, setMarriedYear] = useState('');
  const [endedYear, setEndedYear] = useState('');

  // Filled from the saved marriage when the sheet opens, or switches to a
  // different marriage, and never again while it's open. Adding or removing
  // a child saves straight away and hands back a new marriage object; keyed
  // on that object, the form reset itself and threw away what was picked
  // but not saved yet (a real, previously-shipped bug: an ended marriage
  // turned back to current as soon as a child was added).
  const marriageId = marriage?.id;
  useEffect(() => {
    if (!marriage || !visible) return;
    setStatus(marriage.status);
    // Marriage years are stored Shamsi and shown in this language's calendar (see marriageYearForDisplay).
    setMarriedYear(marriage.marriedYear != null ? String(marriageYearForDisplay(marriage.marriedYear, locale)) : '');
    setEndedYear(marriage.endedYear != null ? String(marriageYearForDisplay(marriage.endedYear, locale)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marriageId, visible]);

  if (!marriage) return null;
  const byId = new Map(people.map((p) => [p.id, p]));
  const inputStyle = [styles.input, isRTL && styles.textEnd];

  const handleSave = () => {
    onSave({
      status,
      // Typed in this language's calendar and digits («۱۳۷۰» reads as 1370).
      marriedYear: marriedYear.trim() ? marriageYearForStorage(Number(toAsciiDigits(marriedYear.trim())), locale) : undefined,
      endedYear: status === 'ended' && endedYear.trim() ? marriageYearForStorage(Number(toAsciiDigits(endedYear.trim())), locale) : undefined,
    });
    onClose();
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Sibling, not wrapping, Pressable for backdrop-dismiss — see PersonSheet's
          comment on why nesting the ScrollView inside a Pressable made scrolling
          fight the backdrop for touch-responder status. */}
      {/* A Modal's content lives outside the app's own gesture root on
          Android, so the draggable children list needs one of its own. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: keyboardHeight }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]}>
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
              {marriage.childIds.length > 1 && (
                <Text style={[styles.emptyHint, isRTL && styles.textEnd]}>{t('childOrderHint')}</Text>
              )}
              {/* In the same order as on the tree, oldest first. */}
              <DraggableChildList
                items={orderedChildIds(marriage, byId).map((id) => ({ id, label: byId.get(id)?.name ?? t('unknown') }))}
                bornTogether={groupsOf(marriage)}
                onToggleBornTogether={onToggleBornTogether}
                bornTogetherLabel={t('bornTogetherLink')}
                onReorder={onReorderChildren}
                onRemove={onRemoveChild}
                removeLabel={t('remove')}
                dragLabel={t('dragToReorder')}
                isRTL={isRTL}
                theme={theme}
              />
              {marriage.childIds.length >= 2 && <Text style={[styles.bornTogetherHint, isRTL && styles.textEnd]}>{t('bornTogetherHint')}</Text>}
              {marriage.manualChildOrder && (
                <Pressable onPress={onResetChildOrder} style={styles.resetOrder}>
                  <Text style={[styles.resetOrderText, isRTL && styles.textEnd]}>{t('sortByBirthDate')}</Text>
                </Pressable>
              )}
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
        people={people.filter((p) => canBeChildOf({ people, marriages: allMarriages }, marriage.id, p.id))}
        onClose={() => setChildPickerOpen(false)}
        onSelect={(existingId) => {
          setChildPickerOpen(false);
          onAddExistingChild(existingId);
        }}
      />
      </GestureHandlerRootView>
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
  bornTogetherHint: { color: theme.inkFaint, fontSize: 12, marginTop: 8 },
  resetOrder: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 8 },
  resetOrderText: { color: theme.lineMarriage, fontSize: 12.5, fontWeight: '600' },
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
