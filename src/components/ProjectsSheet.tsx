import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Project } from '../storage/storage';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';
import type { Rect } from './TreeFlight';
import { localDigits } from '../i18n/locales';

interface Props {
  visible: boolean;
  projects: Project[];
  activeId: string;
  /** How many men and women each tree has, by project id (missing while still being counted). */
  stats: Record<string, { total: number; men: number; women: number } | undefined>;
  /** What a new tree is called unless renamed: the next numbered default («تبارنامه ۳»). */
  defaultNewName: string;
  /** `from` is where the picked row was on screen, for the fly-to-title animation (TreeFlight). */
  onOpen: (projectId: string, from?: Rect) => void;
  onCreate: (name: string) => void;
  onRename: (projectId: string, name: string) => void;
  /** Asks for confirmation itself; never offered for the last remaining tree. */
  onDelete: (projectId: string) => void;
  onClose: () => void;
  /** Opens that tree in edit mode. */
  onEdit: (projectId: string, from?: Rect) => void;
}

/**
 * Every family tree in the app: tap one to open it, rename or delete it in
 * place, or start a new one. Each is its own separate project, with its own
 * people and photos (see storage.ts's ProjectIndex).
 */
export function ProjectsSheet({ visible, projects, activeId, stats, defaultNewName, onOpen, onCreate, onRename, onDelete, onClose, onEdit }: Props) {
  const { t, isRTL, locale } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  // Lifts the sheet above the on-screen keyboard (see useKeyboardHeight).
  const keyboardHeight = useKeyboardHeight();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  // Each row, so a pick can say where it was on screen.
  const rowRefs = useRef(new Map<string, View>());
  /** Calls `then` with the row's place on screen (or nothing, if it can't be measured). */
  const withRowRect = (projectId: string, then: (from?: Rect) => void) => {
    const row = rowRefs.current.get(projectId);
    if (!row) return then();
    row.measureInWindow((x, y, width, height) => then(width > 0 ? { x, y, width, height } : undefined));
  };

  // Every opening starts clean, with nothing half-typed from last time.
  useEffect(() => {
    if (!visible) return;
    setRenamingId(null);
    setCreating(false);
    setNewName('');
  }, [visible]);

  const inputStyle = [styles.input, isRTL && styles.textRTL];

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: keyboardHeight }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]}>
          <Text style={[styles.title, isRTL && styles.textRTL]}>{t('familyTrees')}</Text>
          <Text style={[styles.hint, isRTL && styles.textRTL]}>{t('familyTreesHint')}</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {projects.map((project) => {
              const isActive = project.id === activeId;
              if (renamingId === project.id) {
                return (
                  <View key={project.id} style={[styles.row, styles.rowEditing, isRTL && styles.rowRTL]}>
                    <TextInput style={[...inputStyle, { flex: 1 }]} value={draftName} onChangeText={setDraftName} autoFocus selectTextOnFocus placeholder={t('treeNamePlaceholder')} placeholderTextColor={theme.inkFaint} />
                    <Pressable
                      style={({ pressed }) => [styles.smallButton, styles.smallButtonPrimary, pressed && styles.pressed]}
                      onPress={() => {
                        onRename(project.id, draftName);
                        setRenamingId(null);
                      }}
                    >
                      <Text style={styles.smallButtonPrimaryText}>{t('save')}</Text>
                    </Pressable>
                  </View>
                );
              }
              return (
                <Pressable
                  key={project.id}
                  ref={(node) => {
                    if (node) rowRefs.current.set(project.id, node);
                    else rowRefs.current.delete(project.id);
                  }}
                  style={({ pressed }) => [styles.row, isActive && styles.rowActive, isRTL && styles.rowRTL, pressed && styles.pressed]}
                  onPress={() => withRowRect(project.id, (from) => onOpen(project.id, from))}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, isRTL && styles.textRTL]} numberOfLines={1}>
                      {project.name}
                    </Text>
                    {/* Everyone, men and women in every tree, joined by " - " (a "·" reads
                        as a zero in Persian). The open tree is marked by its border, not words. */}
                    {stats[project.id] && (
                      <Text style={[styles.meta, isRTL && styles.textRTL]}>
                        {[
                          t('peopleCount', { count: localDigits(stats[project.id]!.total, locale) }),
                          t('menCount', { count: localDigits(stats[project.id]!.men, locale) }),
                          t('womenCount', { count: localDigits(stats[project.id]!.women, locale) }),
                        ].join(' - ')}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.smallButton, styles.smallButtonPrimary, pressed && styles.pressed]}
                    onPress={() => withRowRect(project.id, (from) => onEdit(project.id, from))}
                    hitSlop={4}
                  >
                    <Text style={styles.smallButtonPrimaryText}>{t('edit')}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
                    onPress={() => {
                      setDraftName(project.name);
                      setRenamingId(project.id);
                    }}
                    hitSlop={4}
                  >
                    <Text style={styles.smallButtonText}>{t('rename')}</Text>
                  </Pressable>
                  {projects.length > 1 && (
                    <Pressable style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]} onPress={() => onDelete(project.id)} hitSlop={4}>
                      <Text style={[styles.smallButtonText, styles.deleteText]}>{t('delete')}</Text>
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {creating ? (
            <View style={[styles.createRow, isRTL && styles.rowRTL]}>
              <TextInput style={[...inputStyle, { flex: 1 }]} value={newName} onChangeText={setNewName} autoFocus selectTextOnFocus placeholder={t('treeNamePlaceholder')} placeholderTextColor={theme.inkFaint} />
              <Pressable
                style={({ pressed }) => [styles.smallButton, styles.smallButtonPrimary, pressed && styles.pressed]}
                onPress={() => {
                  onCreate(newName);
                  setCreating(false);
                }}
              >
                <Text style={styles.smallButtonPrimaryText}>{t('create')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
              onPress={() => {
                // Starts filled in with the next numbered name; type over it to choose another.
                setNewName(defaultNewName);
                setCreating(true);
              }}
            >
              <Text style={styles.newButtonText}>{t('newTree')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
    title: { color: theme.ink, fontSize: 19, fontWeight: '700' },
    hint: { color: theme.inkDim, fontSize: 13, marginTop: 4, marginBottom: 14, lineHeight: 18 },
    textRTL: { textAlign: 'right', writingDirection: 'rtl' },
    list: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.panel2,
      borderWidth: 1,
      borderColor: theme.stroke,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    rowActive: { borderColor: theme.lineMarriage, borderWidth: 1.5 },
    rowEditing: { paddingVertical: 8 },
    rowRTL: { flexDirection: 'row-reverse' },
    name: { color: theme.ink, fontSize: 15, fontWeight: '700' },
    meta: { color: theme.lineMarriage, fontSize: 12, marginTop: 2, fontWeight: '600' },
    smallButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: theme.stroke },
    smallButtonText: { color: theme.inkDim, fontSize: 12.5, fontWeight: '600' },
    smallButtonPrimary: { backgroundColor: theme.lineMarriage, borderColor: theme.lineMarriage },
    smallButtonPrimaryText: { color: theme.bg, fontSize: 12.5, fontWeight: '700' },
    deleteText: { color: theme.lineEnded },
    input: { color: theme.ink, fontSize: 15, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.stroke, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
    createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    newButton: { borderWidth: 1, borderColor: theme.lineMarriage, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
    newButtonText: { color: theme.lineMarriage, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.6 },
  });
}
