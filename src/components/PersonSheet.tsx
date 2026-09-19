import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import type { Marriage, Person } from '../types';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { formatJalali } from '../utils/jalali';

interface Props {
  person: Person | null;
  /** To list every marriage this person is a spouse in. */
  people: Person[];
  marriages: Marriage[];
  visible: boolean;
  onClose: () => void;
}

/**
 * Read-only. Nothing in this app edits a person's data from here — tapping a
 * card is for looking someone up, not changing them. An explicit edit mode
 * is a separate, later feature.
 */
/** Track-height inset from the top/bottom of the sheet, so the thumb never touches the rounded corners. */
const SCROLLBAR_INSET = 8;
const SCROLLBAR_MIN_THUMB = 28;

export function PersonSheet({ person, people, marriages, visible, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  // Chronological — oldest marriage first. Marriages with no recorded year sort last.
  const personMarriages = useMemo(() => {
    if (!person) return [];
    return marriages
      .filter((m) => m.spouseIds.includes(person.id))
      .slice()
      .sort((a, b) => (a.marriedYear ?? Number.MAX_SAFE_INTEGER) - (b.marriedYear ?? Number.MAX_SAFE_INTEGER));
  }, [marriages, person]);
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* The dismiss-tap catcher is a sibling *behind* the sheet, not an
          ancestor wrapping it — nesting the ScrollView inside a Pressable
          made the two negotiate touch-responder status on every gesture,
          which is why scrolling worked from some starting points and not
          others. As siblings, a touch over the sheet hit-tests to the sheet
          (painted on top) and never reaches the Pressable underneath, so the
          ScrollView never has to fight anything for the touch. */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {person && (
          <View style={styles.sheet}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetContent}
              scrollEventThrottle={16}
              onLayout={(e) => setMetrics((m) => ({ ...m, containerHeight: e.nativeEvent.layout.height }))}
              onContentSizeChange={(_w, h) => setMetrics((m) => ({ ...m, contentHeight: h }))}
              onScroll={(e) => setMetrics((m) => ({ ...m, offset: e.nativeEvent.contentOffset.y }))}
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
                      {person.died ? ` · ${t('diedPrefix')} ${formatJalali(person.died)}` : ` · ${t('living')}`}
                    </Text>
                  )}
                </View>
              </View>

              {person.unknown ? (
                <Text style={[styles.note, isRTL && styles.textEnd]}>{t('noInfoRecorded')}</Text>
              ) : (
                <View style={styles.body}>
                  <Field styles={styles} label={t('placeOfBirth')} value={person.birthPlace} dash={t('dash')} isRTL={isRTL} />
                  {person.died != null && <Field styles={styles} label={t('placeOfBurial')} value={person.gravePlace} dash={t('dash')} isRTL={isRTL} />}
                  {personMarriages.length > 0 && (
                    <View>
                      <Text style={[styles.fieldLabel, isRTL && styles.textEnd]}>{t('marriages')}</Text>
                      <View style={{ gap: 10, marginTop: 4 }}>
                        {personMarriages.map((m) => {
                          const spouseId = m.spouseIds.find((id) => id !== person.id)!;
                          const spouse = byId.get(spouseId);
                          const spouseName = !spouse || spouse.unknown ? t('unknown') : spouse.name;
                          const marriedText = m.marriedYear != null ? String(m.marriedYear) : t('yearUnknown');
                          const value =
                            m.status === 'ended' ? `${marriedText} – ${m.endedYear != null ? String(m.endedYear) : t('yearUnknown')}` : marriedText;
                          return <Field key={m.id} styles={styles} label={spouseName} value={value} dash={t('dash')} isRTL={isRTL} />;
                        })}
                      </View>
                    </View>
                  )}
                  <Field styles={styles} label={t('notes')} value={person.notes} dash={t('dash')} isRTL={isRTL} multiline />
                  {!person.photoUri && <Text style={[styles.photoSlot, isRTL && styles.textEnd]}>{t('noPhoto')}</Text>}
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
