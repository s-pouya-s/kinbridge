import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../theme';
import { useI18n, type TFunction } from '../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * A revisitable "how do I..." reference, not a one-shot first-launch splash
 * — App.tsx shows it automatically the very first time (see its own
 * onboardingSeen check), but it stays reachable afterward from the header's
 * "?" button, since "how do I add a spouse" is exactly the kind of thing
 * someone forgets *after* the first session, not during it.
 *
 * The four sections mirror the app's actual affordances one-for-one (down
 * to the literal button labels, quoted) rather than describing the data
 * model in the abstract — someone reading this should be able to follow it
 * with the tree open next to them.
 */
export function OnboardingSheet({ visible, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  // A numeric pixel cap, not a '88%' string — a percentage height resolves
  // against this Modal's own root, which on some platforms/RN versions
  // doesn't reliably hand that root a definite height before layout, and
  // an unresolved percentage there means no cap at all: the sheet (and the
  // ScrollView inside it, which can only scroll once ITS OWN box is
  // actually bounded) both just grow to fit content instead of clipping
  // it — on a tall guide like this one, that reads as "doesn't scroll" on
  // a small phone, when really it just never became scrollable in the
  // first place. useWindowDimensions().height is a real number React Native
  // already resolved, so this cap is never ambiguous.
  const maxSheetHeight = window.height * 0.85;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Sibling, not wrapping, Pressable for backdrop-dismiss — see
          PersonSheet's comment on why nesting the ScrollView inside a
          Pressable made scrolling fight the backdrop for touch-responder
          status. */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: maxSheetHeight }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            // The device's own on-screen back/home/recents bar (or, on
            // iOS, the home-indicator strip) sits right at the physical
            // bottom edge that this sheet slides up from — this Modal
            // doesn't know about either, so without adding insets.bottom
            // here, the "Got it" button ended up drawn right underneath
            // it: visible enough to see, but not reliably tappable.
            contentContainerStyle={[styles.content, { paddingBottom: 36 + insets.bottom }]}
          >
            <Text style={[styles.title, isRTL && styles.textEnd]}>{t('onboardingTitle')}</Text>
            <Text style={[styles.intro, isRTL && styles.textEnd]}>{t('onboardingIntro')}</Text>
            <View style={styles.noteBox}>
              <Text style={[styles.noteText, isRTL && styles.textEnd]}>{t('onboardingEditModeNote')}</Text>
            </View>

            <Section styles={styles} isRTL={isRTL} t={t} titleKey="onboardingAddPersonTitle" bodyKey="onboardingAddPersonBody" />
            <Section styles={styles} isRTL={isRTL} t={t} titleKey="onboardingAddSpouseTitle" bodyKey="onboardingAddSpouseBody" />
            <Section styles={styles} isRTL={isRTL} t={t} titleKey="onboardingAddParentsTitle" bodyKey="onboardingAddParentsBody" />
            <Section styles={styles} isRTL={isRTL} t={t} titleKey="onboardingAddChildTitle" bodyKey="onboardingAddChildBody" last />

            <Pressable style={styles.primaryButton} onPress={onClose}>
              <Text style={styles.primaryButtonText}>{t('onboardingGotIt')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Section({
  titleKey,
  bodyKey,
  isRTL,
  t,
  styles,
  last,
}: {
  titleKey: Parameters<TFunction>[0];
  bodyKey: Parameters<TFunction>[0];
  isRTL: boolean;
  t: TFunction;
  styles: Styles;
  last?: boolean;
}) {
  return (
    <View style={[styles.section, last && styles.sectionLast]}>
      <Text style={[styles.sectionTitle, isRTL && styles.textEnd]}>{t(titleKey)}</Text>
      <Text style={[styles.sectionBody, isRTL && styles.textEnd]}>{t(bodyKey)}</Text>
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    content: { padding: 20, paddingBottom: 36 },
    textEnd: { textAlign: 'right', writingDirection: 'rtl' },
    title: { color: theme.ink, fontSize: 19, fontWeight: '700', marginBottom: 6 },
    intro: { color: theme.inkDim, fontSize: 13.5, lineHeight: 19, marginBottom: 14 },
    noteBox: {
      backgroundColor: theme.panel2,
      borderWidth: 1,
      borderColor: theme.stroke,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 18,
    },
    noteText: { color: theme.inkDim, fontSize: 12.5, lineHeight: 18 },
    section: { marginBottom: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: theme.stroke },
    sectionLast: { marginBottom: 6, paddingBottom: 0, borderBottomWidth: 0 },
    sectionTitle: { color: theme.lineMarriage, fontSize: 14.5, fontWeight: '700', marginBottom: 6 },
    sectionBody: { color: theme.ink, fontSize: 13.5, lineHeight: 20 },
    primaryButton: { backgroundColor: theme.lineMarriage, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
    primaryButtonText: { color: theme.bg, fontSize: 14, fontWeight: '700' },
  });
}
