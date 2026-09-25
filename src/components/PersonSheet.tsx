import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import type { Marriage, Person } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { formatJalali } from '../utils/jalali';
import { albumPhotoUri } from '../utils/album';
import { isDeceased } from '../model/people';
import { PhotoViewer } from './PhotoViewer';

interface Props {
  person: Person | null;
  /** To list every marriage this person is a spouse in. */
  people: Person[];
  marriages: Marriage[];
  visible: boolean;
  onClose: () => void;
  /** Opens this person's own family tree (see PersonTreeView). */
  onShowTree: (personId: string) => void;
}

/**
 * Read-only. Nothing in this app edits a person's data from here — tapping a
 * card is for looking someone up, not changing them. An explicit edit mode
 * is a separate, later feature.
 */
/** Track-height inset from the top/bottom of the sheet, so the thumb never touches the rounded corners. */
const SCROLLBAR_INSET = 8;
const SCROLLBAR_MIN_THUMB = 28;

export function PersonSheet({ person, people, marriages, visible, onClose, onShowTree }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // Modals draw edge-to-edge too, so the sheet adds the system bars' own
  // insets itself — otherwise its last row sits under the back/home bar.
  const insets = useSafeAreaInsets();
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  // Chronological — oldest marriage first. Marriages with no recorded year sort last.
  const personMarriages = useMemo(() => {
    if (!person) return [];
    return marriages
      .filter((m) => m.spouseIds.includes(person.id))
      .slice()
      .sort((a, b) => (a.marriedYear ?? Number.MAX_SAFE_INTEGER) - (b.marriedYear ?? Number.MAX_SAFE_INTEGER));
  }, [marriages, person]);
  // The couple this person was born to (at most one — see mutations.ts's
  // hasParents), then every child across all their own marriages, in
  // the same oldest-marriage-first order as the list above.
  const parents = useMemo(() => {
    if (!person) return [];
    const parentMarriage = marriages.find((m) => m.childIds.includes(person.id));
    return parentMarriage ? parentMarriage.spouseIds.flatMap((id) => byId.get(id) ?? []) : [];
  }, [marriages, person, byId]);
  const children = useMemo(() => personMarriages.flatMap((m) => m.childIds.flatMap((id) => byId.get(id) ?? [])), [personMarriages, byId]);
  const displayName = (p: Person) => (p.unknown ? t('unknown') : p.name);
  const albumUris = useMemo(() => (person?.photos ?? []).map(albumPhotoUri), [person]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // The OS's own scroll indicator defaults to a color that's nearly
  // invisible against this dark theme (and, on Android, is drawn as an
  // overlay right on top of the text) — so this rolls a small one with a
  // color and position we actually control, in the sheet's own padding
  // gutter rather than over the content.
  const [metrics, setMetrics] = useState({ contentHeight: 0, containerHeight: 0, offset: 0 });

  const overflow = metrics.contentHeight > metrics.containerHeight + 1;
  const trackHeight = Math.max(0, metrics.containerHeight - SCROLLBAR_INSET * 2);
  const thumbHeight = overflow ? Math.min(trackHeight, Math.max(SCROLLBAR_MIN_THUMB, (metrics.containerHeight / metrics.contentHeight) * trackHeight)) : 0;
  const maxOffset = Math.max(1, metrics.contentHeight - metrics.containerHeight);
  const thumbTop = overflow ? (Math.min(1, metrics.offset / maxOffset)) * (trackHeight - thumbHeight) : 0;

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* The dismiss-tap catcher is a sibling *behind* the sheet, not an
          ancestor wrapping it — nesting the ScrollView inside a Pressable
          made the two negotiate touch-responder status on every gesture,
          which is why scrolling worked from some starting points and not
          others. As siblings, a touch over the sheet hit-tests to the sheet
          (painted on top) and never reaches the Pressable underneath, so the
          ScrollView never has to fight anything for the touch. */}
      <View style={[styles.backdrop, { paddingTop: insets.top }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {person && (
          <View style={styles.sheet}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.sheetContent, { paddingBottom: 16 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]}
              scrollEventThrottle={16}
              // Read the event's numbers right away: React recycles the event
              // object, so reading it later, inside the state updater, found
              // it already cleared (a real, previously-shipped crash).
              onLayout={(e) => {
                const containerHeight = e.nativeEvent.layout.height;
                setMetrics((m) => ({ ...m, containerHeight }));
              }}
              onContentSizeChange={(_w, h) => setMetrics((m) => ({ ...m, contentHeight: h }))}
              onScroll={(e) => {
                const offset = e.nativeEvent.contentOffset.y;
                setMetrics((m) => ({ ...m, offset }));
              }}
            >
              <View style={[styles.header, isRTL && styles.rowRTL]}>
                {person.photoUri ? (
                  <Image source={{ uri: person.photoUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{person.unknown ? '?' : person.name.charAt(0)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, isRTL && styles.textEnd]}>
                    {person.unknown ? t('unknown') : `${person.name}${person.surname ? ' ' + person.surname : ''}`}
                  </Text>
                  {!person.unknown && (
                    <Text style={[styles.dates, isRTL && styles.textEnd]}>
                      {person.born ? `${t('bornPrefix')} ${formatJalali(person.born)}` : t('birthYearUnknown')}
                      {person.died ? ` · ${t('diedPrefix')} ${formatJalali(person.died)}` : isDeceased(person) ? ` · ${t('deceased')}` : ` · ${t('living')}`}
                    </Text>
                  )}
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.treeButton, isRTL && styles.rowRTL, pressed && { opacity: 0.6 }]}
                onPress={() => onShowTree(person.id)}
              >
                <Text style={styles.treeButtonText}>{t('showFamilyTree')}</Text>
              </Pressable>

              {person.unknown ? (
                <Text style={[styles.note, isRTL && styles.textEnd]}>{t('noInfoRecorded')}</Text>
              ) : (
                <View style={styles.body}>
                  <Field styles={styles} label={t('placeOfBirth')} value={person.birthPlace} dash={t('dash')} isRTL={isRTL} />
                  {isDeceased(person) && <Field styles={styles} label={t('placeOfBurial')} value={person.gravePlace} dash={t('dash')} isRTL={isRTL} />}
                  <NameList styles={styles} label={t('parents')} names={parents.map(displayName)} dash={t('dash')} isRTL={isRTL} />
                  <NameList styles={styles} label={t('children', { count: children.length })} names={children.map(displayName)} dash={t('dash')} isRTL={isRTL} />
                  <NameList
                    styles={styles}
                    label={t('marriages')}
                    names={personMarriages.map((m) => {
                      const spouse = byId.get(m.spouseIds.find((id) => id !== person.id)!);
                      return spouse ? displayName(spouse) : t('unknown');
                    })}
                    dash={t('dash')}
                    isRTL={isRTL}
                  />
                  <Field styles={styles} label={t('notes')} value={person.notes} dash={t('dash')} isRTL={isRTL} multiline />
                  {albumUris.length > 0 && (
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{t('albumCount', { count: albumUris.length })}</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[styles.albumStrip, isRTL && styles.rowRTL]}
                      >
                        {albumUris.map((uri, i) => (
                          <Pressable key={`${i}-${uri.slice(-24)}`} onPress={() => setViewerIndex(i)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
                            <Image source={{ uri }} style={styles.albumThumb} />
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {!person.photoUri && albumUris.length === 0 && <Text style={[styles.photoSlot, isRTL && styles.textEnd]}>{t('noPhoto')}</Text>}
                </View>
              )}
            </ScrollView>
            {overflow && (
              <View style={[styles.scrollTrack, { top: SCROLLBAR_INSET, bottom: SCROLLBAR_INSET }]} pointerEvents="none">
                <View style={[styles.scrollThumb, { height: thumbHeight, top: thumbTop }]} />
              </View>
            )}
          </View>
        )}
      </View>
      <PhotoViewer uris={albumUris} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} closeLabel={t('close')} />
    </Modal>
  );
}

function Field({
  label,
  value,
  dash,
  multiline,
  isRTL,
  styles,
}: {
  label: string;
  value?: string;
  dash: string;
  multiline?: boolean;
  isRTL: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{label}</Text>
      <Text style={[styles.fieldValue, multiline && { lineHeight: 19 }, isRTL && styles.textEnd]}>
        {value && value.length > 0 ? value : dash}
      </Text>
    </View>
  );
}

/** A labeled row of name chips — for relatives, where there's usually more than one. */
function NameList({ label, names, dash, isRTL, styles }: { label: string; names: string[]; dash: string; isRTL: boolean; styles: Styles }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{label}</Text>
      {names.length === 0 ? (
        <Text style={[styles.fieldValue, isRTL && styles.textEnd]}>{dash}</Text>
      ) : (
        <View style={[styles.chips, isRTL && styles.rowRTL]}>
          {names.map((name, i) => (
            <View key={i} style={styles.chip}>
              <Text style={[styles.chipText, isRTL && styles.textEnd]}>{name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  sheetContent: { padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  rowRTL: { flexDirection: 'row-reverse' },
  textEnd: { textAlign: 'right', writingDirection: 'rtl' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.nodeStroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: theme.lineMarriage, fontSize: 20, fontWeight: '700' },
  avatarImage: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.panel2 },
  name: { color: theme.ink, fontSize: 18, fontWeight: '700' },
  dates: { color: theme.inkDim, fontSize: 13, marginTop: 3 },
  body: { gap: 14 },
  field: {},
  fieldLabel: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  fieldValue: { color: theme.ink, fontSize: 14 },
  albumStrip: { gap: 10, paddingVertical: 4 },
  albumThumb: { width: 104, height: 104, borderRadius: 12, backgroundColor: theme.panel2 },
  treeButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.lineMarriage,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  treeButtonText: { color: theme.lineMarriage, fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    backgroundColor: theme.panel2,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: { color: theme.ink, fontSize: 14 },
  photoSlot: { color: theme.inkFaint, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  note: { color: theme.inkDim, fontSize: 14 },
  scrollTrack: {
    position: 'absolute',
    right: 6,
    width: 4,
    borderRadius: 2,
    backgroundColor: theme.stroke,
  },
  scrollThumb: {
    position: 'absolute',
    width: 4,
    borderRadius: 2,
    backgroundColor: theme.inkFaint,
  },
  });
}
