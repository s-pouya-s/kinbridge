import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FamilyData, ID, Marriage, Person } from './src/types';
import { sampleFamily } from './src/data/sampleFamily';
import { loadFamilyData, saveFamilyData, exportFamilyData, importFamilyData } from './src/storage/storage';
import { showAlert, confirmDestructive } from './src/utils/alert';
import {
  addChild,
  addExistingChild,
  addExistingSpouse,
  addParents,
  addSpouse,
  addStandalonePerson,
  canDeleteMarriage,
  deleteMarriage,
  deletePerson,
  movePersonGeneration,
  movePersonOneStep,
  removeChildFromMarriage,
  resetRowOrder,
  updateMarriage,
  updatePerson,
} from './src/model/mutations';
import { TreeCanvas } from './src/components/TreeCanvas';
import { PersonSheet } from './src/components/PersonSheet';
import { MarriageSheet } from './src/components/MarriageSheet';
import { PersonEditSheet } from './src/components/PersonEditSheet';
import { MarriageEditSheet } from './src/components/MarriageEditSheet';
import { theme } from './src/theme';
import { I18nProvider, useI18n } from './src/i18n';

/**
 * The tree itself is mirrored via TreeCanvas's `isRTL` prop (see layout/layout.ts
 * mirrorX), driven by the current locale (see src/i18n). Flipping the native
 * app chrome's own direction too (I18nManager.forceRTL + reload) is a real
 * production step left out of this scaffold since it requires a native
 * restart to take effect — the tree-mirroring and string translation are the
 * parts that were actually being designed here.
 */

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider initialLocale="fa">
          <Root />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const insets = useSafeAreaInsets();
  const { t, isRTL, locale, setLocale } = useI18n();
  const [data, setData] = useState<FamilyData | null>(null);
  const [editMode, setEditMode] = useState(false);

  // View mode
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedMarriage, setSelectedMarriage] = useState<Marriage | null>(null);
  // Edit mode
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingMarriage, setEditingMarriage] = useState<Marriage | null>(null);

  const [resetToken, setResetToken] = useState(0);
  const [focusPersonId, setFocusPersonId] = useState<ID | null>(null);

  useEffect(() => {
    loadFamilyData().then((saved) => {
      setData(saved ?? sampleFamily);
    });
  }, []);

  if (!data) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.lineMarriage} />
      </View>
    );
  }

  /** Applies a pure mutation to `data`, persists it, and returns whatever the mutator handed back (e.g. a newly-created person). */
  function applyMutation<T>(mutator: (d: FamilyData) => { data: FamilyData; result: T }): T {
    let result!: T;
    let nextData: FamilyData | undefined;
    setData((prev) => {
      if (!prev) return prev;
      const out = mutator(prev);
      result = out.result;
      nextData = out.data;
      return out.data;
    });
    if (nextData) saveFamilyData(nextData).catch((err) => showAlert(t('saveFailed'), String(err)));
    return result;
  }

  const handleExport = async () => {
    try {
      await exportFamilyData(data);
    } catch (err) {
      showAlert(t('exportFailed'), String(err));
    }
  };

  const handleImport = async () => {
    try {
      const imported = await importFamilyData();
      if (imported) {
        setData(imported);
        setResetToken((v) => v + 1);
      }
    } catch (err) {
      showAlert(t('importFailed'), String(err));
    }
  };

  const handleAddPerson = () => {
    const person = applyMutation((d) => {
      const out = addStandalonePerson(d);
      return { data: out.data, result: out.person };
    });
    setEditingPerson(person);
    setFocusPersonId(person.id);
  };

  const handleSavePerson = (personId: ID, patch: Partial<Person>) => {
    applyMutation((d) => ({ data: updatePerson(d, personId, patch), result: undefined }));
  };

  const handleMovePersonGeneration = (personId: ID, direction: 'up' | 'down') => {
    applyMutation((d) => ({ data: movePersonGeneration(d, personId, direction), result: undefined }));
  };

  const handleMovePersonStep = (personId: ID, direction: 'earlier' | 'later') => {
    applyMutation((d) => ({ data: movePersonOneStep(d, personId, direction), result: undefined }));
  };

  const handleResetOrder = (personId: ID) => {
    applyMutation((d) => ({ data: resetRowOrder(d, personId), result: undefined }));
  };

  const handleDeletePerson = (person: Person) => {
    const displayName = person.unknown ? t('unknown') : person.name;
    confirmDestructive(
      t('deletePersonConfirmTitle', { name: displayName }),
      t('deletePersonConfirmMessage'),
      t('delete'),
      t('cancel'),
      () => {
        applyMutation((d) => ({ data: deletePerson(d, person.id), result: undefined }));
        setEditingPerson(null);
      }
    );
  };

  const handleAddSpouse = (personId: ID) => {
    const person = applyMutation((d) => {
      const out = addSpouse(d, personId);
      return { data: out.data, result: out.person };
    });
    setEditingPerson(person);
    setFocusPersonId(person.id);
  };

  const handleAddExistingSpouse = (personId: ID, existingSpouseId: ID) => {
    applyMutation((d) => ({ data: addExistingSpouse(d, personId, existingSpouseId).data, result: undefined }));
  };

  const handleAddParents = (childId: ID) => {
    const parentA = applyMutation((d) => {
      const out = addParents(d, childId);
      return { data: out.data, result: out.parentA };
    });
    setEditingPerson(parentA);
    setFocusPersonId(parentA.id);
  };

  const handleAddExistingParents = (childId: ID, marriageId: ID) => {
    applyMutation((d) => ({ data: addExistingChild(d, marriageId, childId), result: undefined }));
  };

  const handleSaveMarriage = (marriageId: ID, patch: Parameters<typeof updateMarriage>[2]) => {
    applyMutation((d) => ({ data: updateMarriage(d, marriageId, patch), result: undefined }));
  };

  const handleDeleteMarriage = (marriageId: ID) => {
    applyMutation((d) => ({ data: deleteMarriage(d, marriageId), result: undefined }));
    setEditingMarriage(null);
  };

  const handleAddChild = (marriageId: ID) => {
    const person = applyMutation((d) => {
      const out = addChild(d, marriageId);
      return { data: out.data, result: out.person };
    });
    setEditingMarriage(null);
    setEditingPerson(person);
    setFocusPersonId(person.id);
  };

  const handleAddExistingChild = (marriageId: ID, existingChildId: ID) => {
    applyMutation((d) => ({ data: addExistingChild(d, marriageId, existingChildId), result: undefined }));
    // Keep the sheet's `marriage` prop in sync so the children list updates immediately.
    setEditingMarriage((m) => (m && m.id === marriageId && !m.childIds.includes(existingChildId) ? { ...m, childIds: [...m.childIds, existingChildId] } : m));
  };

  const handleRemoveChild = (marriageId: ID, childId: ID) => {
    applyMutation((d) => ({ data: removeChildFromMarriage(d, marriageId, childId), result: undefined }));
    // Keep the sheet's `marriage` prop in sync so the children list updates immediately.
    setEditingMarriage((m) => (m && m.id === marriageId ? { ...m, childIds: m.childIds.filter((c) => c !== childId) } : m));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, isRTL && styles.headerRTL]}>
        <Text style={styles.title}>{t('appTitle')}</Text>
        <View style={[styles.headerButtons, isRTL && styles.rowRTL]}>
          {editMode && <HeaderButton label={t('addPerson')} onPress={handleAddPerson} />}
          <HeaderButton label={t('import')} onPress={handleImport} />
          <HeaderButton label={t('export')} onPress={handleExport} />
          <HeaderButton label={t('resetView')} onPress={() => setResetToken((v) => v + 1)} />
          <Pressable style={styles.localeToggle} onPress={() => setLocale(locale === 'fa' ? 'en' : 'fa')}>
            <Text style={styles.localeToggleText}>{locale === 'fa' ? 'EN' : 'FA'}</Text>
          </Pressable>
          <Pressable style={[styles.editToggle, editMode && styles.editToggleActive]} onPress={() => setEditMode((v) => !v)}>
            <Text style={[styles.editToggleText, editMode && styles.editToggleTextActive]}>{editMode ? t('done') : t('edit')}</Text>
          </Pressable>
        </View>
      </View>

      <TreeCanvas
        data={data}
        isRTL={isRTL}
        editMode={editMode}
        resetToken={resetToken}
        focusPersonId={focusPersonId}
        onPersonPress={(person) => setSelectedPerson(person)}
        onPersonEdit={(person) => setEditingPerson(person)}
        onMarriagePress={(marriage) => setSelectedMarriage(marriage)}
        onMarriageEdit={(marriage) => setEditingMarriage(marriage)}
        onMovePersonStep={handleMovePersonStep}
        onMovePersonGeneration={handleMovePersonGeneration}
      />

      <PersonSheet person={selectedPerson} visible={selectedPerson != null} onClose={() => setSelectedPerson(null)} />
      <MarriageSheet
        marriage={selectedMarriage}
        people={data.people}
        allMarriages={data.marriages}
        visible={selectedMarriage != null}
        onClose={() => setSelectedMarriage(null)}
      />

      <PersonEditSheet
        person={editingPerson}
        people={data.people}
        marriages={data.marriages}
        visible={editingPerson != null}
        onClose={() => setEditingPerson(null)}
        onSave={(patch) => editingPerson && handleSavePerson(editingPerson.id, patch)}
        onDelete={() => editingPerson && handleDeletePerson(editingPerson)}
        onAddSpouse={() => editingPerson && handleAddSpouse(editingPerson.id)}
        onAddExistingSpouse={(existingId) => editingPerson && handleAddExistingSpouse(editingPerson.id, existingId)}
        onAddParents={() => editingPerson && handleAddParents(editingPerson.id)}
        onAddExistingParents={(marriageId) => editingPerson && handleAddExistingParents(editingPerson.id, marriageId)}
        onResetOrder={() => editingPerson && handleResetOrder(editingPerson.id)}
      />
      <MarriageEditSheet
        marriage={editingMarriage}
        people={data.people}
        visible={editingMarriage != null}
        canDelete={editingMarriage != null && canDeleteMarriage(data, editingMarriage.id)}
        onClose={() => setEditingMarriage(null)}
        onSave={(patch) => editingMarriage && handleSaveMarriage(editingMarriage.id, patch)}
        onDelete={() => editingMarriage && handleDeleteMarriage(editingMarriage.id)}
        onAddChild={() => editingMarriage && handleAddChild(editingMarriage.id)}
        onAddExistingChild={(existingId) => editingMarriage && handleAddExistingChild(editingMarriage.id, existingId)}
        onRemoveChild={(childId) => editingMarriage && handleRemoveChild(editingMarriage.id, childId)}
      />

      <StatusBar style="light" />
    </View>
  );
}

function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.headerButton} onPress={onPress}>
      <Text style={styles.headerButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.stroke,
    flexWrap: 'wrap',
    rowGap: 8,
  },
  headerRTL: { flexDirection: 'row-reverse' },
  rowRTL: { flexDirection: 'row-reverse' },
  title: { color: theme.ink, fontSize: 20, fontWeight: '700' },
  headerButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerButton: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: { color: theme.inkDim, fontSize: 12, fontWeight: '600' },
  localeToggle: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  localeToggleText: { color: theme.inkDim, fontSize: 11, fontWeight: '700' },
  editToggle: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  editToggleActive: { backgroundColor: theme.lineMarriage, borderColor: theme.lineMarriage },
  editToggleText: { color: theme.inkDim, fontSize: 12, fontWeight: '700' },
  editToggleTextActive: { color: theme.bg },
});
