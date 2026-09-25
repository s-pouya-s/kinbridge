import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FamilyData, ID, Marriage, Person } from './src/types';
import { sampleFamily } from './src/data/sampleFamily';
import {
  deleteFamilyData,
  exportTrees,
  importedTreeData,
  loadFamilyData,
  loadProjectIndex,
  newProjectId,
  saveFamilyData,
  NOT_AN_EXPORT,
  pickImportFile,
  saveProjectIndex,
  type ImportFile,
  type Project,
  type ProjectIndex,
} from './src/storage/storage';
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
  type NewPersonName,
  setChildOrder,
  removeChildFromMarriage,
  resetChildOrder,
  updateMarriage,
  updatePerson,
} from './src/model/mutations';
import { TreeCanvas } from './src/components/TreeCanvas';
import { PersonSheet } from './src/components/PersonSheet';
import { MarriageSheet } from './src/components/MarriageSheet';
import { PersonEditSheet } from './src/components/PersonEditSheet';
import { MarriageEditSheet } from './src/components/MarriageEditSheet';
import { OnboardingSheet } from './src/components/OnboardingSheet';
import { SideMenu } from './src/components/SideMenu';
import { RelationshipSheet, type RelationshipSlot } from './src/components/RelationshipSheet';
import { RelationshipChart } from './src/components/RelationshipChart';
import { PersonPicker } from './src/components/PersonPicker';
import { PersonTreeView } from './src/components/PersonTreeView';
import { ProjectsSheet } from './src/components/ProjectsSheet';
import { TreeChooserSheet } from './src/components/TreeChooserSheet';
import { findRelationshipRoutes, type PathStep } from './src/model/relationship';
import { ThemeProvider, useTheme, type Theme } from './src/theme';
import { I18nProvider, useI18n } from './src/i18n';
import { useLaunchInterstitialAd } from './src/ads/launchInterstitial';
import { pruneAlbumFiles } from './src/utils/album';
import type { CardStyle } from './src/layout/layout';

/** Same "kinbridge:" namespacing as storage.ts's and theme.ts's own AsyncStorage keys. */
const ONBOARDING_SEEN_KEY = 'kinbridge:onboardingSeen:v1';
const MINIMAP_KEY = 'kinbridge:showMinimap:v1';
const CARD_STYLE_KEY = 'kinbridge:cardStyle:v1';
const RIBBON_KEY = 'kinbridge:showRibbon:v1';

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
  // Every family tree ("project") in the app, and which one is open. The ref
  // is what saves read, so a save never lands in the wrong tree even while
  // one is being switched out for another.
  const [projectIndex, setProjectIndex] = useState<ProjectIndex | null>(null);
  const activeProjectRef = useRef<string | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  // Export and import each ask which trees first; importFile is the picked file while its trees are being chosen.
  const [exportChooserOpen, setExportChooserOpen] = useState(false);
  const [importFile, setImportFile] = useState<ImportFile | null>(null);
  // On by default; only an explicit "off" is ever stored.
  const [showRibbon, setShowRibbon] = useState(true);
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

  const [menuVisible, setMenuVisible] = useState(false);
  // On by default; only an explicit "off" is ever stored.
  const [showMinimap, setShowMinimap] = useState(true);
  // Large cards unless someone has switched to compact.
  const [cardStyle, setCardStyle] = useState<CardStyle>('large');
  // Find relationship: the two chosen people, which one (if any) is being
  // picked by tapping the tree right now, and the route being shown.
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [relationshipIds, setRelationshipIds] = useState<Record<RelationshipSlot, ID | null>>({ first: null, second: null });
  const [pickingSlot, setPickingSlot] = useState<RelationshipSlot | null>(null);
  // A person's own tree: whose it is (while open), whether the "whose?"
  // search is open, and whether they're being picked by tapping the tree.
  const [personTreeId, setPersonTreeId] = useState<ID | null>(null);
  const [personTreePickerOpen, setPersonTreePickerOpen] = useState(false);
  const [pickingPersonTree, setPickingPersonTree] = useState(false);
  const [relationshipRoutes, setRelationshipRoutes] = useState<PathStep[][] | null>(null);
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  // What someone just added is called until they're given a real name.
  const newPersonName: NewPersonName =
    locale === 'fa' ? { label: t('newPersonLabel'), formatNumber: (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) } : { label: t('newPersonLabel') };
  // The first tree is «شجره‌نامه من» ("My family tree"); each new one adds
  // the next number, «شجره‌نامه من ۲», «شجره‌نامه من ۳», ... one past the
  // highest any tree already has (the unnumbered one counts as 1), in either
  // language, so a number is never handed out twice.
  const localDigits = (n: number) => (locale === 'fa' ? String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) : String(n));
  const nextTreeName = (projects: Project[]) => {
    let max = 0;
    for (const p of projects) {
      const match = /^(?:My family tree|شجره[‌ ]?نامه من)(?: ([0-9۰-۹]+))?$/.exec(p.name);
      if (match) max = Math.max(max, match[1] ? Number(match[1].replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) : 1);
    }
    return max === 0 ? t('treeBaseName') : `${t('treeBaseName')} ${localDigits(max + 1)}`;
  };

  // A brand new tree: one person to start from, named like anyone just added.
  // Defined up here, before the loading return below, because the startup
  // effect needs it on the very first render.
  const starterTree = (): FamilyData => addStandalonePerson({ people: [], marriages: [] }, newPersonName).data;

  useLaunchInterstitialAd(() => showAlert(t('adThanksTitle')));

  useEffect(() => {
    (async () => {
      const index = await loadProjectIndex(t('treeBaseName'));
      activeProjectRef.current = index.activeId;
      setProjectIndex(index);
      const saved = await loadFamilyData(index.activeId);
      // Only the very first tree on a fresh install starts from the sample family.
      setData(saved ?? (index.projects.length === 1 ? sampleFamily : starterTree()));
      try {
        // Photos from every tree share one folder, so all of them count.
        const all = await Promise.all(index.projects.map((p) => loadFamilyData(p.id)));
        pruneAlbumFiles(all.filter((d): d is FamilyData => d != null));
      } catch {
        // Only housekeeping; never worth failing the app over.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    AsyncStorage.getItem(MINIMAP_KEY).then((v) => {
      if (v === '0') setShowMinimap(false);
    });
    AsyncStorage.getItem(CARD_STYLE_KEY).then((v) => {
      if (v === 'compact') setCardStyle('compact');
    });
    AsyncStorage.getItem(RIBBON_KEY).then((v) => {
      if (v === '0') setShowRibbon(false);
    });
  }, []);

  const toggleMinimap = () => {
    const next = !showMinimap;
    setShowMinimap(next);
    AsyncStorage.setItem(MINIMAP_KEY, next ? '1' : '0').catch(() => {});
  };

  const toggleRibbon = () => {
    const next = !showRibbon;
    setShowRibbon(next);
    AsyncStorage.setItem(RIBBON_KEY, next ? '1' : '0').catch(() => {});
  };

  const toggleCardStyle = () => {
    const next: CardStyle = cardStyle === 'compact' ? 'large' : 'compact';
    setCardStyle(next);
    AsyncStorage.setItem(CARD_STYLE_KEY, next).catch(() => {});
  };

  const dismissOnboarding = () => {
    setOnboardingVisible(false);
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1').catch(() => {});
  };

  if (!data || !projectIndex) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.lineMarriage} />
      </View>
    );
  }

  const activeProject = projectIndex.projects.find((p) => p.id === projectIndex.activeId) ?? projectIndex.projects[0];

  const updateIndex = (next: ProjectIndex) => {
    setProjectIndex(next);
    saveProjectIndex(next).catch((err) => showAlert(t('saveFailed'), String(err)));
  };

  /** Opens another tree: its data, a fresh camera, and nothing left selected or half-edited from the last one. */
  const openProject = async (projectId: string, index: ProjectIndex, preloaded?: FamilyData) => {
    activeProjectRef.current = projectId;
    updateIndex({ ...index, activeId: projectId });
    const loaded = preloaded ?? (await loadFamilyData(projectId)) ?? starterTree();
    setSelectedPerson(null);
    setSelectedMarriage(null);
    setEditingPerson(null);
    setEditingMarriageId(null);
    setData(loaded);
    setResetToken((v) => v + 1);
  };

  /** A tree's name: the next numbered default when left empty, and never one already taken ("… (2)"). */
  const uniqueName = (name: string, projects: Project[]) => {
    const base = name.trim() || nextTreeName(projects);
    const taken = new Set(projects.map((p) => p.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} (${localDigits(n)})`)) n++;
    return `${base} (${localDigits(n)})`;
  };

  /** Saves each tree as a new project and opens the first of them. */
  const addProjects = async (trees: { name: string; data: FamilyData }[]) => {
    let projects = projectIndex.projects;
    const added: Project[] = [];
    for (const tree of trees) {
      const project = { id: newProjectId(), name: uniqueName(tree.name, projects), createdAt: new Date().toISOString() };
      await saveFamilyData(project.id, tree.data);
      projects = [...projects, project];
      added.push(project);
    }
    if (added.length > 0) await openProject(added[0].id, { ...projectIndex, projects }, trees[0].data);
  };
  const addProject = (name: string, treeData: FamilyData) => addProjects([{ name, data: treeData }]);

  const handleCreateProject = (name: string) => {
    addProject(name, starterTree()).catch((err) => showAlert(t('saveFailed'), String(err)));
  };

  const handleRenameProject = (projectId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateIndex({ ...projectIndex, projects: projectIndex.projects.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p)) });
  };

  const handleDeleteProject = (projectId: string) => {
    const project = projectIndex.projects.find((p) => p.id === projectId);
    if (!project || projectIndex.projects.length <= 1) return;
    confirmDestructive(t('deleteTreeConfirmTitle', { name: project.name }), t('deleteTreeConfirmMessage'), t('delete'), t('cancel'), () => {
      const remaining = projectIndex.projects.filter((p) => p.id !== projectId);
      deleteFamilyData(projectId).catch(() => {});
      const next = { ...projectIndex, projects: remaining };
      if (projectId === projectIndex.activeId) openProject(remaining[0].id, next);
      else updateIndex(next);
    });
  };

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
    const projectId = activeProjectRef.current;
    if (nextData && projectId) saveFamilyData(projectId, nextData).catch((err) => showAlert(t('saveFailed'), String(err)));
    return result;
  }

  // Export first asks which trees to put in the file (see the TreeChooserSheet below).
  const handleExport = () => setExportChooserOpen(true);

  const exportChosen = async (projectIds: string[]) => {
    setExportChooserOpen(false);
    try {
      const trees = [];
      for (const project of projectIndex.projects) {
        if (!projectIds.includes(project.id)) continue;
        const treeData = project.id === projectIndex.activeId ? data : await loadFamilyData(project.id);
        if (treeData) trees.push({ name: project.name, data: treeData });
      }
      await exportTrees(trees);
    } catch (err) {
      showAlert(t('exportFailed'), String(err));
    }
  };

  // Import reads the file, then asks which of its trees to bring in. Each
  // becomes a tree of its own, never written over one that's already here.
  const handleImport = async () => {
    try {
      const file = await pickImportFile();
      if (file && file.trees.length > 0) setImportFile(file);
    } catch (err) {
      showAlert(t('importFailed'), err instanceof Error && err.message === NOT_AN_EXPORT ? t('importNotExportFile') : String(err));
    }
  };

  const importChosen = async (keys: string[]) => {
    const file = importFile;
    setImportFile(null);
    if (!file) return;
    try {
      const chosen = keys.map((k) => file.trees[Number(k)]);
      await addProjects(chosen.map((tree) => ({ name: tree.name, data: importedTreeData(tree, file.albumFiles) })));
    } catch (err) {
      showAlert(t('importFailed'), String(err));
    }
  };

  const handleAddPerson = () => {
    // Doesn't open their edit sheet — right after creating someone, it's
    // ambiguous whether the sheet that pops open is for them or is still the
    // one you were just looking at. They're named "New person N" / «فرد جدید N» (see
    // addStandalonePerson) and found the same way as anyone else: pan/zoom
    // to them and tap.
    applyMutation((d) => ({ data: addStandalonePerson(d, newPersonName).data, result: undefined }));
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
    applyMutation((d) => ({ data: addSpouse(d, personId, newPersonName).data, result: undefined }));
  };

  const handleAddExistingSpouse = (personId: ID, existingSpouseId: ID) => {
    applyMutation((d) => ({ data: addExistingSpouse(d, personId, existingSpouseId).data, result: undefined }));
  };

  const handleAddParents = (childId: ID) => {
    // See handleAddPerson — never auto-opens the new person's own edit sheet.
    applyMutation((d) => ({ data: addParents(d, childId, newPersonName).data, result: undefined }));
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
    applyMutation((d) => ({ data: addChild(d, marriageId, newPersonName).data, result: undefined }));
  };

  const handleAddExistingChild = (marriageId: ID, existingChildId: ID) => {
    applyMutation((d) => ({ data: addExistingChild(d, marriageId, existingChildId), result: undefined }));
  };

  const handleRemoveChild = (marriageId: ID, childId: ID) => {
    applyMutation((d) => ({ data: removeChildFromMarriage(d, marriageId, childId), result: undefined }));
  };

  return (
    // Padded on every edge, not just the top — Android draws edge-to-edge,
    // so without the bottom/side insets the tree and its hint bar sat under
    // the back/home bar (and, in landscape, under the side navigation bar).
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={[styles.header, isRTL && styles.headerRTL]}>
        <Pressable
          style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
          onPress={() => setMenuVisible(true)}
          accessibilityLabel={t('menu')}
          hitSlop={8}
        >
          {/* Three drawn bars rather than a ☰ glyph, which not every Android font has. */}
          <View style={styles.menuBar} />
          <View style={styles.menuBar} />
          <View style={styles.menuBar} />
        </Pressable>
        {/* The open tree's name; tap it to switch trees. Pushed to the far
            side of the bar from the ☰ button, so the two never sit together. */}
        <Pressable style={({ pressed }) => [styles.titleButton, isRTL && styles.headerRTL, pressed && styles.menuButtonPressed]} onPress={() => setProjectsOpen(true)}>
          <Text style={[styles.title, isRTL && styles.rtlText]} numberOfLines={1}>
            {activeProject.name}
          </Text>
          <Text style={styles.titleChevron}>▾</Text>
        </Pressable>
        {/* Every button now lives in the side menu, so this is the only
            on-screen sign that edit mode is on. Tapping it turns it off. */}
        {editMode && (
          <Pressable style={({ pressed }) => [styles.editBadge, pressed && styles.menuButtonPressed]} onPress={() => setEditMode(false)}>
            <Text style={[styles.editBadgeText, isRTL && styles.rtlText]}>{t('done')}</Text>
          </Pressable>
        )}
      </View>

      <TreeCanvas
        data={data}
        isRTL={isRTL}
        editMode={editMode}
        resetToken={resetToken}
        onAddPerson={handleAddPerson}
        showMinimap={showMinimap}
        cardStyle={cardStyle}
        showRibbon={showRibbon}
        pickPrompt={
          pickingPersonTree
            ? {
                message: t('tapPersonForTree'),
                cancelLabel: t('cancel'),
                onPick: (person) => {
                  setPickingPersonTree(false);
                  setPersonTreeId(person.id);
                },
                onCancel: () => setPickingPersonTree(false),
              }
            : pickingSlot
            ? {
                message: t(pickingSlot === 'first' ? 'tapFirstPerson' : 'tapSecondPerson'),
                cancelLabel: t('cancel'),
                onPick: (person) => {
                  setRelationshipIds((ids) => ({ ...ids, [pickingSlot]: person.id }));
                  setPickingSlot(null);
                  setRelationshipOpen(true);
                },
                onCancel: () => {
                  setPickingSlot(null);
                  setRelationshipOpen(true);
                },
              }
            : undefined
        }
        onPersonPress={(person) => setSelectedPerson(person)}
        onPersonEdit={(person) => setEditingPerson(person)}
        onMarriagePress={(marriage) => setSelectedMarriage(marriage)}
        onMarriageEdit={(marriage) => setEditingMarriageId(marriage.id)}
        onMovePersonGeneration={handleMovePersonGeneration}
      />

      <PersonSheet
        person={selectedPerson}
        people={data.people}
        marriages={data.marriages}
        visible={selectedPerson != null}
        onClose={() => setSelectedPerson(null)}
        onShowTree={(personId) => {
          setSelectedPerson(null);
          setPersonTreeId(personId);
        }}
      />
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
        onReorderChildren={(ids) => editingMarriage && applyMutation((d) => ({ data: setChildOrder(d, editingMarriage.id, ids), result: undefined }))}
        onResetChildOrder={() => editingMarriage && applyMutation((d) => ({ data: resetChildOrder(d, editingMarriage.id), result: undefined }))}
      />

      <OnboardingSheet visible={onboardingVisible} onClose={dismissOnboarding} />

      <TreeChooserSheet
        visible={exportChooserOpen}
        title={t('exportTreesTitle')}
        hint={t('exportTreesHint')}
        items={projectIndex.projects.map((p) => ({
          key: p.id,
          name: p.name,
          detail: p.id === projectIndex.activeId ? `${t('currentTree')} · ${t('peopleCount', { count: data.people.length })}` : undefined,
        }))}
        initiallySelected={[projectIndex.activeId]}
        actionLabel={(count) => t('exportN', { count })}
        onConfirm={exportChosen}
        onClose={() => setExportChooserOpen(false)}
      />
      <TreeChooserSheet
        visible={importFile != null}
        title={t('importTreesTitle')}
        hint={t('importTreesHint')}
        items={(importFile?.trees ?? []).map((tree, i) => ({
          key: String(i),
          name: tree.name || nextTreeName(projectIndex.projects),
          detail: t('peopleCount', { count: tree.data.people.length }),
        }))}
        initiallySelected={(importFile?.trees ?? []).map((_, i) => String(i))}
        actionLabel={(count) => t('importN', { count })}
        onConfirm={importChosen}
        onClose={() => setImportFile(null)}
      />
      <ProjectsSheet
        visible={projectsOpen}
        projects={projectIndex.projects}
        activeId={projectIndex.activeId}
        activePeopleCount={data.people.length}
        defaultNewName={nextTreeName(projectIndex.projects)}
        onOpen={(projectId) => {
          setProjectsOpen(false);
          if (projectId !== projectIndex.activeId) openProject(projectId, projectIndex);
        }}
        onCreate={(name) => {
          setProjectsOpen(false);
          handleCreateProject(name);
        }}
        onRename={handleRenameProject}
        onDelete={handleDeleteProject}
        onClose={() => setProjectsOpen(false)}
      />

      <PersonPicker
        visible={personTreePickerOpen}
        people={data.people.filter((p) => !p.unknown)}
        onClose={() => setPersonTreePickerOpen(false)}
        onSelect={(personId) => {
          setPersonTreePickerOpen(false);
          setPersonTreeId(personId);
        }}
        onPickOnTree={() => {
          setPersonTreePickerOpen(false);
          setPickingPersonTree(true);
        }}
      />
      <PersonTreeView data={data} personId={personTreeId} cardStyle={cardStyle} showMinimap={showMinimap} showRibbon={showRibbon} onClose={() => setPersonTreeId(null)} />

      <RelationshipSheet
        visible={relationshipOpen}
        people={data.people}
        firstId={relationshipIds.first}
        secondId={relationshipIds.second}
        onChoose={(slot, personId) => setRelationshipIds((ids) => ({ ...ids, [slot]: personId }))}
        onPickOnTree={(slot) => {
          setRelationshipOpen(false);
          setPickingSlot(slot);
        }}
        onShow={() => {
          const { first, second } = relationshipIds;
          if (!first || !second) return;
          const routes = findRelationshipRoutes(data, first, second);
          if (routes.length === 0) {
            showAlert(t('notRelated'));
            return;
          }
          setRelationshipOpen(false);
          setRelationshipRoutes(routes);
        }}
        onClose={() => setRelationshipOpen(false)}
      />
      <RelationshipChart
        data={data}
        showRibbon={showRibbon}
        routes={relationshipRoutes}
        onClose={() => {
          setRelationshipRoutes(null);
          setRelationshipOpen(true);
        }}
      />

      <SideMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        editMode={editMode}
        onToggleEditMode={() => setEditMode((v) => !v)}
        onToggleLocale={() => setLocale(locale === 'fa' ? 'en' : 'fa')}
        onToggleTheme={toggleMode}
        showMinimap={showMinimap}
        onToggleMinimap={toggleMinimap}
        cardStyle={cardStyle}
        onToggleCardStyle={toggleCardStyle}
        showRibbon={showRibbon}
        onToggleRibbon={toggleRibbon}
        onHelp={() => setOnboardingVisible(true)}
        onPersonTree={() => setPersonTreePickerOpen(true)}
        onFindRelationship={() => {
          // Always a fresh start from the menu; closing the chart comes back
          // to the sheet with the same two people, so they can be changed.
          setRelationshipIds({ first: null, second: null });
          setRelationshipOpen(true);
        }}
        onImport={handleImport}
        onExport={handleExport}
      />

      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.stroke,
    gap: 12,
  },
  headerRTL: { flexDirection: 'row-reverse' },
  rtlText: { writingDirection: 'rtl' },
  titleButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  title: { color: theme.ink, fontSize: 20, fontWeight: '700', flexShrink: 1 },
  titleChevron: { color: theme.inkDim, fontSize: 14 },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
  },
  // Immediate visual feedback on press — without it, a tap gave no
  // acknowledgment until whatever it opened had finished appearing.
  menuButtonPressed: { opacity: 0.55 },
  menuBar: { width: 18, height: 2, borderRadius: 1, backgroundColor: theme.inkDim },
  editBadge: {
    backgroundColor: theme.lineMarriage,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  editBadgeText: { color: theme.bg, fontSize: 12, fontWeight: '700' },
  });
}
