import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FamilyData, ID } from '../types';
import type { CardStyle } from '../layout/layout';
import { personTreeData } from '../model/personTree';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import { TreeCanvas } from './TreeCanvas';

interface Props {
  data: FamilyData;
  /** Whose tree to show; null keeps it closed. */
  personId: ID | null;
  cardStyle: CardStyle;
  showMinimap: boolean;
  showRibbon: boolean;
  onClose: () => void;
}

const noop = () => {};

/**
 * One person's own family tree, full screen: them, every recorded ancestor
 * and every recorded descendant (see personTreeData), drawn by the same
 * TreeCanvas as the main tree, so zoom, pan, the overview map and the card
 * style all behave the same. Read-only. The person starts centered and
 * selected; tapping someone else twice switches to that person's own tree.
 */
export function PersonTreeView({ data, personId, cardStyle, showMinimap, showRibbon, onClose }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [focusId, setFocusId] = useState<ID | null>(personId);
  useEffect(() => setFocusId(personId), [personId]);

  const tree = useMemo(() => (focusId ? personTreeData(data, focusId) : null), [data, focusId]);
  const person = focusId ? data.people.find((p) => p.id === focusId) : undefined;
  const name = !person ? '' : person.unknown ? t('unknown') : [person.name, person.surname].filter(Boolean).join(' ');

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={personId != null} animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
          <View style={[styles.header, isRTL && styles.rowRTL]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, isRTL && styles.textRTL]} numberOfLines={1}>
                {t('personTreeTitle', { name })}
              </Text>
              {tree && <Text style={[styles.subtitle, isRTL && styles.textRTL]}>{t('personTreeCount', { count: tree.people.length })}</Text>}
            </View>
            <Pressable style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]} onPress={onClose} accessibilityLabel={t('close')} hitSlop={8}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {tree && focusId && (
            <TreeCanvas
              data={tree}
              isRTL={isRTL}
              editMode={false}
              resetToken={0}
              cardStyle={cardStyle}
              showMinimap={showMinimap}
              showRibbon={showRibbon}
              focusPersonId={focusId}
              tapAgainHint={t('tapAgainForTheirTree')}
              onAddPerson={noop}
              onPersonPress={(p) => setFocusId(p.id)}
              onPersonEdit={noop}
              onMarriagePress={noop}
              onMarriageEdit={noop}
              onMovePersonGeneration={noop}
            />
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.stroke,
    },
    rowRTL: { flexDirection: 'row-reverse' },
    textRTL: { textAlign: 'right', writingDirection: 'rtl' },
    title: { color: theme.ink, fontSize: 19, fontWeight: '700' },
    subtitle: { color: theme.inkDim, fontSize: 13, marginTop: 2 },
    close: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.panel2, borderWidth: 1, borderColor: theme.stroke, alignItems: 'center', justifyContent: 'center' },
    closeText: { color: theme.ink, fontSize: 24, fontWeight: '600', lineHeight: 26 },
  });
}
