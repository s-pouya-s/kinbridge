import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  removeChildFromMarriage,
  updateMarriage,
  updatePerson,
} from './src/model/mutations';
import { TreeCanvas } from './src/components/TreeCanvas';
import { PersonSheet } from './src/components/PersonSheet';
import { MarriageSheet } from './src/components/MarriageSheet';
import { PersonEditSheet } from './src/components/PersonEditSheet';
import { MarriageEditSheet } from './src/components/MarriageEditSheet';
import { OnboardingSheet } from './src/components/OnboardingSheet';
import { ThemeProvider, useTheme, type Theme } from './src/theme';
import { I18nProvider, useI18n } from './src/i18n';
import { useLaunchInterstitialAd } from './src/ads/launchInterstitial';

/** Same "kinbridge:" namespacing as storage.ts's and theme.ts's own AsyncStorage keys. */
const ONBOARDING_SEEN_KEY = 'kinbridge:onboardingSeen:v1';

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
        <ThemeProvider>
          <I18nProvider initialLocale="fa">
            <Root />
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const insets = useSafeAreaInsets();
  const { t, isRTL, locale, setLocale } = useI18n();
  const { theme, mode, toggleMode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [data, setData] = useState<FamilyData | null>(null);
  const [editMode, setEditMode] = useState(false);

  // View mode
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedMarriage, setSelectedMarriage] = useState<Marriage | null>(null);
  // Edit mode
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  // Stored as an id, not a snapshot of the Marriage object — the sheet stays
  // open across several add-child taps in a row (see handleAddChild), and a
  // snapshot would need to be hand-patched after every single mutation to
  // keep its childIds current. Deriving it fresh from `data` below means
  // it's always exactly what's actually in the tree, with no separate copy
  // that can drift out of sync.
  const [editingMarriageId, setEditingMarriageId] = useState<ID | null>(null);

  const [resetToken, setResetToken] = useState(0);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');

  // Drives the "more buttons" chevron on the header's scrollable button row —
  // shown only while there's actually more to scroll to.
  const [headerOverflow, setHeaderOverflow] = useState(false);
  const [headerAtEnd, setHeaderAtEnd] = useState(false);
  const headerViewportWidth = useRef(0);
  const headerContentWidth = useRef(0);

  const [onboardingVisible, setOnboardingVisible] = useState(false);

  useLaunchInterstitialAd(() => showAlert(t('adThanksTitle')));

  useEffect(() => {
    loadFamilyData().then((saved) => {
      setData(saved ?? sampleFamily);
    });
  }, []);

  // Shown once, automatically, the very first time the app is opened —
  // afterward it's only reachable by tapping the header's own "?" button
  // (see ONBOARDING_SEEN_KEY below). A brand new install has no
  // family-data save yet either, so this piggybacks on that same "have we
  // ever run before" signal rather than needing its own separate check.
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((seen) => {
      if (!seen) setOnboardingVisible(true);
    });
  }, []);

  const dismissOnboarding = () => {
    setOnboardingVisible(false);
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1').catch(() => {});
  };

  if (!data) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.lineMarriage} />
      </View>
    );
  }

  const editingMarriage = editingMarriageId != null ? data.marriages.find((m) => m.id === editingMarriageId) ?? null : null;

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
    // Doesn't open their edit sheet — right after creating someone, it's
    // ambiguous whether the sheet that pops open is for them or is still the
    // one you were just looking at. They're named "New person N" (see
    // addStandalonePerson) and found the same way as anyone else: pan/zoom
    // to them and tap.
    applyMutation((d) => ({ data: addStandalonePerson(d).data, result: undefined }));
  };

  const handleSavePerson = (personId: ID, patch: Partial<Person>) => {
    applyMutation((d) => ({ data: updatePerson(d, personId, patch), result: undefined }));
  };

  const handleMovePersonGeneration = (personId: ID, direction: 'up' | 'down') => {
    applyMutation((d) => ({ data: movePersonGeneration(d, personId, direction), result: undefined }));
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
    // See handleAddPerson — never auto-opens the new person's own edit sheet.
    applyMutation((d) => ({ data: addSpouse(d, personId).data, result: undefined }));
  };

  const handleAddExistingSpouse = (personId: ID, existingSpouseId: ID) => {
    applyMutation((d) => ({ data: addExistingSpouse(d, personId, existingSpouseId).data, result: undefined }));
  };

  const handleAddParents = (childId: ID) => {
    // See handleAddPerson — never auto-opens the new person's own edit sheet.
    applyMutation((d) => ({ data: addParents(d, childId).data, result: undefined }));
  };

  const handleAddExistingParents = (childId: ID, marriageId: ID) => {
    applyMutation((d) => ({ data: addExistingChild(d, marriageId, childId), result: undefined }));
  };

  const handleSaveMarriage = (marriageId: ID, patch: Parameters<typeof updateMarriage>[2]) => {
    applyMutation((d) => ({ data: updateMarriage(d, marriageId, patch), result: undefined }));
  };

  const handleDeleteMarriage = (marriageId: ID) => {
    applyMutation((d) => ({ data: deleteMarriage(d, marriageId), result: undefined }));
    setEditingMarriageId(null);
  };

  const handleAddChild = (marriageId: ID) => {
    // See handleAddPerson — never auto-opens the new person's own edit sheet,
    // and (unlike a delete) never closes this marriage's own sheet either —
    // adding one child often means adding several in a row. No separate
    // "keep the sheet in sync" step needed — editingMarriage is derived
    // straight from `data` above, so it already reflects the new child as
    // soon as this mutation lands. (A real, previously-shipped crash: this
    // used to read the newly-created person back out of applyMutation's
    // return value, which only actually resolves synchronously when
    // there's no update from this same hook already in flight — the very
    // "several in a row" case this comment describes reliably had one in
    // flight, from the tap before.)
    applyMutation((d) => ({ data: addChild(d, marriageId).data, result: undefined }));
  };

  const handleAddExistingChild = (marriageId: ID, existingChildId: ID) => {
    applyMutation((d) => ({ data: addExistingChild(d, marriageId, existingChildId), result: undefined }));
  };

  const handleRemoveChild = (marriageId: ID, childId: ID) => {
    applyMutation((d) => ({ data: removeChildFromMarriage(d, marriageId, childId), result: undefined }));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, isRTL && styles.headerRTL]}>
        <Text style={[styles.title, isRTL && styles.rtlText]}>{t('appTitle')}</Text>
        <View style={styles.headerScrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.headerScroll}
            contentContainerStyle={styles.headerButtons}
            onLayout={(e) => {
              headerViewportWidth.current = e.nativeEvent.layout.width;
              setHeaderOverflow(headerContentWidth.current > headerViewportWidth.current + 1);
            }}
            onContentSizeChange={(w) => {
              headerContentWidth.current = w;
              setHeaderOverflow(w > headerViewportWidth.current + 1);
            }}
            onScroll={(e) => {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              setHeaderAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 4);
            }}
            scrollEventThrottle={32}
          >
            {editMode && <HeaderButton styles={styles} label={t('addPerson')} onPress={handleAddPerson} />}
            <HeaderButton styles={styles} label={t('resetView')} onPress={() => setResetToken((v) => v + 1)} />
            {/* Always visible, in both modes — which way the tree is laid out
                is just as relevant while browsing it as while editing it.
                Shows the glyph for whichever orientation tapping it switches
                *to* (matching the locale toggle's own EN/FA convention right
                below), not the current one. */}
            <Pressable
              style={({ pressed }) => [styles.localeToggle, pressed && styles.localeTogglePressed]}
              onPress={() => setOrientation((v) => (v === 'vertical' ? 'horizontal' : 'vertical'))}
              accessibilityLabel={t('orientation')}
            >
              <Text style={styles.localeToggleText}>{orientation === 'vertical' ? '↔' : '↕'}</Text>
            </Pressable>
            {/* Always visible, in both modes — unlike Import/Export/locale/theme
                (view mode only) or "+ Person" (edit mode only), "how do I add a
                spouse" is exactly as likely to come up while looking at the tree
                as while editing it. */}
            <Pressable
              style={({ pressed }) => [styles.localeToggle, pressed && styles.localeTogglePressed]}
              onPress={() => setOnboardingVisible(true)}
              accessibilityLabel={t('help')}
            >
              <Text style={styles.localeToggleText}>?</Text>
            </Pressable>
            {!editMode && (
              <Pressable
                style={({ pressed }) => [styles.localeToggle, pressed && styles.localeTogglePressed]}
                onPress={() => setLocale(locale === 'fa' ? 'en' : 'fa')}
              >
                <Text style={styles.localeToggleText}>{locale === 'fa' ? 'EN' : 'FA'}</Text>
              </Pressable>
            )}
            {!editMode && (
              <Pressable style={({ pressed }) => [styles.localeToggle, pressed && styles.localeTogglePressed]} onPress={toggleMode}>
                <Text style={styles.localeToggleText}>{mode === 'dark' ? '🌙' : '☀️'}</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.editToggle, editMode && styles.editToggleActive, pressed && styles.editTogglePressed]}
              onPress={() => setEditMode((v) => !v)}
            >
              <Text style={[styles.editToggleText, isRTL && styles.rtlText, editMode && styles.editToggleTextActive]}>{editMode ? t('done') : t('edit')}</Text>
            </Pressable>
            {!editMode && <HeaderButton styles={styles} label={t('import')} onPress={handleImport} />}
            {!editMode && <HeaderButton styles={styles} label={t('export')} onPress={handleExport} />}
          </ScrollView>
          {headerOverflow && !headerAtEnd && (
            <View style={styles.headerScrollHint} pointerEvents="none">
              <Text style={styles.headerScrollHintText}>›</Text>
            </View>
          )}
        </View>
      </View>

      <TreeCanvas
        data={data}
        isRTL={isRTL}
        editMode={editMode}
        orientation={orientation}
        resetToken={resetToken}
        onPersonPress={(person) => setSelectedPerson(person)}
        onPersonEdit={(person) => setEditingPerson(person)}
        onMarriagePress={(marriage) => setSelectedMarriage(marriage)}
        onMarriageEdit={(marriage) => setEditingMarriageId(marriage.id)}
        onMovePersonGeneration={handleMovePersonGeneration}
      />

      <PersonSheet person={selectedPerson} people={data.people} marriages={data.marriages} visible={selectedPerson != null} onClose={() => setSelectedPerson(null)} />
      <MarriageSheet
        marriage={selectedMarriage}
        people={data.people}
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
        onRemoveParents={() => {
          if (!editingPerson) return;
          const parentMarriage = data.marriages.find((m) => m.childIds.includes(editingPerson.id));
          if (parentMarriage) handleRemoveChild(parentMarriage.id, editingPerson.id);
        }}
        onRemoveSpouse={(marriageId) => handleDeleteMarriage(marriageId)}
      />
      <MarriageEditSheet
        marriage={editingMarriage}
        people={data.people}
        visible={editingMarriage != null}
        canDelete={editingMarriage != null && canDeleteMarriage(data, editingMarriage.id)}
        onClose={() => setEditingMarriageId(null)}
        onSave={(patch) => editingMarriage && handleSaveMarriage(editingMarriage.id, patch)}
        onDelete={() => editingMarriage && handleDeleteMarriage(editingMarriage.id)}
        onAddChild={() => editingMarriage && handleAddChild(editingMarriage.id)}
        onAddExistingChild={(existingId) => editingMarriage && handleAddExistingChild(editingMarriage.id, existingId)}
        onRemoveChild={(childId) => editingMarriage && handleRemoveChild(editingMarriage.id, childId)}
      />

      <OnboardingSheet visible={onboardingVisible} onClose={dismissOnboarding} />

      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function HeaderButton({ label, onPress, styles }: { label: string; onPress: () => void; styles: Styles }) {
  const { isRTL } = useI18n();
  return (
    <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]} onPress={onPress}>
      <Text style={[styles.headerButtonText, isRTL && styles.rtlText]}>{label}</Text>
    </Pressable>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
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
    gap: 12,
  },
  headerRTL: { flexDirection: 'row-reverse' },
  rtlText: { writingDirection: 'rtl' },
  title: { color: theme.ink, fontSize: 20, fontWeight: '700', flexShrink: 0 },
  headerScrollWrap: { flexShrink: 1, position: 'relative' },
  headerScroll: {},
  headerButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerScrollHint: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 22,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerScrollHintText: { color: theme.inkFaint, fontSize: 16, fontWeight: '700' },
  headerButton: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: { color: theme.inkDim, fontSize: 12, fontWeight: '600' },
  // Immediate visual feedback on press, for every header button — before
  // this, tapping gave no acknowledgment at all until whatever the button
  // actually did finished (e.g. Reset's 400ms), which read as "did nothing
  // happen?" in the meantime.
  headerButtonPressed: { opacity: 0.55 },
  localeToggle: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  localeTogglePressed: { opacity: 0.55 },
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
    editTogglePressed: { opacity: 0.55 },
    editToggleText: { color: theme.inkDim, fontSize: 12, fontWeight: '700' },
    editToggleTextActive: { color: theme.bg },
  });
}
