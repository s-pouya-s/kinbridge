import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * The thank-you shown right after someone has watched the launch ad to the
 * end (see useLaunchInterstitialAd): a small centered card, not a system
 * alert, so it looks like part of the app.
 */
export function ThanksDialog({ visible, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          {/* Its own Text: an emoji in the same string as Persian can be measured too narrow on Android and vanish (see SideMenu's MenuRow). */}
          <Text style={styles.icon}>💛</Text>
          <Text style={[styles.title, isRTL && styles.textRTL]}>{t('adThanksTitle')}</Text>
          <Text style={[styles.message, isRTL && styles.textRTL]}>{t('adThanksMessage')}</Text>
          <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]} onPress={onClose}>
            <Text style={styles.buttonText}>{t('adThanksButton')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.panel,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.stroke,
      paddingHorizontal: 24,
      paddingTop: 26,
      paddingBottom: 20,
      alignItems: 'center',
      boxShadow: `0px 10px 30px ${theme.cardShadow}`,
    },
    icon: { fontSize: 40, marginBottom: 10 },
    title: { color: theme.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' },
    message: { color: theme.inkDim, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
    textRTL: { writingDirection: 'rtl', textAlign: 'center' },
    button: { alignSelf: 'stretch', backgroundColor: theme.lineMarriage, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 20 },
    buttonText: { color: theme.bg, fontSize: 15, fontWeight: '700' },
  });
}
