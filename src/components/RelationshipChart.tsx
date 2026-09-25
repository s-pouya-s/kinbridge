import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FamilyData, ID, Person } from '../types';
import { buildRelationshipChart, type PathStep } from '../model/relationship';
import { useTheme, type Theme } from '../theme';
import { useI18n, type TFunction } from '../i18n';
import { LineSegment } from './LineSegment';
import { cardColors, raisedCardStyle } from './cardLook';
import { ZoomableView } from './ZoomableView';
import { MourningRibbon } from './MourningRibbon';
import { isDeceased } from '../model/people';

const CARD_WIDTH = 156;
const CARD_HEIGHT = 84;
const COL = 188;
const ROW = 170;
const PAD = 28;

interface Props {
  data: FamilyData;
  /** Every route between the two people, shortest first (see findRelationshipRoutes); null keeps the chart closed. */
  routes: PathStep[][] | null;
  onClose: () => void;
  /** See TreeCanvas's showRibbon. */
  showRibbon: boolean;
}

/**
 * The relationship between two people, as a small family tree holding only
 * them and everyone who connects them (see buildRelationshipChart). Each
 * card after the first says how that person relates to the one before, so
 * the route reads start to end: "Father of Sara", "Father of Dad", and so on.
 * The two people it was asked about are outlined in the selection color.
 *
 * When they're connected more than one way, a row of route chips along the
 * top picks which one is drawn, shortest first, like choosing between the
 * routes a map app offers. Pinch to zoom, drag to move, ↻ to fit it back.
 */
export function RelationshipChart({ data, routes, onClose, showRibbon }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [routeIndex, setRouteIndex] = useState(0);
  // A new pair of people always starts on their shortest route.
  useEffect(() => setRouteIndex(0), [routes]);
  const path = routes?.[Math.min(routeIndex, routes.length - 1)] ?? null;
  const byId = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const chart = useMemo(() => (path ? buildRelationshipChart(data, path) : null), [data, path]);

  const maxCol = chart ? Math.max(...chart.nodes.map((n) => n.col)) : 0;
  const maxRow = chart ? Math.max(...chart.nodes.map((n) => n.row)) : 0;
  const width = PAD * 2 + maxCol * COL + CARD_WIDTH;
  const height = PAD * 2 + maxRow * ROW + CARD_HEIGHT;
  // Read in the locale's direction: right to left in Persian.
  const centerX = (col: number) => PAD + (isRTL ? maxCol - col : col) * COL + CARD_WIDTH / 2;
  const centerY = (row: number) => PAD + row * ROW + CARD_HEIGHT / 2;
  const nodeById = new Map(chart?.nodes.map((n) => [n.personId, n]) ?? []);
  const nameOf = (id?: ID) => {
    const p = id ? byId.get(id) : undefined;
    return !p || p.unknown ? t('unknown') : p.name;
  };

  const first = path?.[0]?.personId;
  const last = path?.[path.length - 1]?.personId;

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={routes != null} animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={[styles.header, isRTL && styles.rowRTL]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, isRTL && styles.textRTL]}>{t('relationship')}</Text>
            {path && (
              <Text style={[styles.subtitle, isRTL && styles.textRTL]}>
                {t('relationshipSummary', { from: nameOf(first), to: nameOf(last), count: path.length - 1 })}
              </Text>
            )}
          </View>
          <Pressable style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]} onPress={onClose} accessibilityLabel={t('close')} hitSlop={8}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        {routes && routes.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.routesBar}
            contentContainerStyle={[styles.routes, isRTL && styles.rowRTL]}
          >
            {routes.map((r, i) => (
              <Pressable
                key={i}
                onPress={() => setRouteIndex(i)}
                style={({ pressed }) => [styles.routeChip, i === routeIndex && styles.routeChipActive, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.routeChipText, i === routeIndex && styles.routeChipTextActive]}>
                  {t('routeN', { n: i + 1, count: r.length - 1 })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {chart && (
          <ZoomableView contentWidth={width} contentHeight={height} fitKey={`${routeIndex}`} resetLabel={t('resetView')} isRTL={isRTL} theme={theme}>
              <View style={{ width, height }}>
                {chart.links.map((link, i) => {
                  if (link.kind === 'marriage') {
                    const a = nodeById.get(link.a)!;
                    const b = nodeById.get(link.b)!;
                    const [x1, x2] = [centerX(a.col), centerX(b.col)].sort((p, q) => p - q);
                    const y = centerY(a.row);
                    return <LineSegment key={i} x1={x1 + CARD_WIDTH / 2} y1={y} x2={x2 - CARD_WIDTH / 2} y2={y} color={theme.lineMarriage} strokeWidth={3} />;
                  }
                  // Down from the parents (from the middle of a couple's
                  // marriage line, or a single parent's bottom edge), across,
                  // and down into the child's top edge.
                  const parents = link.parents.map((id) => nodeById.get(id)!);
                  const child = nodeById.get(link.child)!;
                  const px = parents.reduce((sum, n) => sum + centerX(n.col), 0) / parents.length;
                  const startY = parents.length > 1 ? centerY(parents[0].row) : centerY(parents[0].row) + CARD_HEIGHT / 2;
                  const cx = centerX(child.col);
                  const endY = centerY(child.row) - CARD_HEIGHT / 2;
                  const midY = (centerY(parents[0].row) + CARD_HEIGHT / 2 + endY) / 2;
                  return (
                    <React.Fragment key={i}>
                      <LineSegment x1={px} y1={startY} x2={px} y2={midY} color={theme.lineBlood} strokeWidth={3} />
                      <LineSegment x1={px} y1={midY} x2={cx} y2={midY} color={theme.lineBlood} strokeWidth={3} />
                      <LineSegment x1={cx} y1={midY} x2={cx} y2={endY} color={theme.lineBlood} strokeWidth={3} />
                    </React.Fragment>
                  );
                })}

                {chart.nodes.map((n) => {
                  const person = byId.get(n.personId);
                  if (!person) return null;
                  const colors = cardColors(person, theme);
                  const isEnd = n.personId === first || n.personId === last;
                  return (
                    <View
                      key={n.personId}
                      style={[
                        styles.card,
                        {
                          left: centerX(n.col) - CARD_WIDTH / 2,
                          top: centerY(n.row) - CARD_HEIGHT / 2,
                          backgroundColor: colors.fill,
                          borderColor: isEnd ? theme.selected : colors.stroke,
                          borderWidth: isEnd ? 2.5 : 1,
                        },
                        !person.unknown && raisedCardStyle(colors.fill, theme),
                        isRTL && styles.rowRTL,
                      ]}
                    >
                      {person.photoUri ? (
                        <Image source={{ uri: person.photoUri }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarEmpty, { borderColor: colors.stroke }]}>
                          <Text style={[styles.initial, { color: colors.stroke }]}>{person.unknown ? '?' : person.name.charAt(0)}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.name, isRTL && styles.textRTL]}>
                          {nameOf(n.personId)}
                        </Text>
                        {n.step?.link && (
                          <Text numberOfLines={2} style={[styles.relation, isRTL && styles.textRTL]}>
                            {t('relationOf', { relation: relationWord(n.step.link, person, t), name: nameOf(n.prevPersonId) })}
                          </Text>
                        )}
                      </View>
                      {showRibbon && isDeceased(person) && <MourningRibbon radius={15} side="left" />}
                    </View>
                  );
                })}
              </View>
          </ZoomableView>
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** What `person` is to the one before them in the route, by their gender when it's known. */
function relationWord(link: 'parent' | 'child' | 'spouse', person: Person, t: TFunction): string {
  const male = person.gender === 'male';
  const female = person.gender === 'female';
  if (link === 'parent') return male ? t('relFather') : female ? t('relMother') : t('relParent');
  if (link === 'child') return male ? t('relSon') : female ? t('relDaughter') : t('relChild');
  return male ? t('relHusband') : female ? t('relWife') : t('relSpouse');
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
    routesBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.stroke },
    routes: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    routeChip: { borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.panel2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
    routeChipActive: { backgroundColor: theme.lineMarriage, borderColor: theme.lineMarriage },
    routeChipText: { color: theme.inkDim, fontSize: 13, fontWeight: '600' },
    routeChipTextActive: { color: theme.bg },
    card: {
      position: 'absolute',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
    },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.panel },
    avatarEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    initial: { fontSize: 18, fontWeight: '700' },
    name: { color: theme.ink, fontSize: 16, fontWeight: '700' },
    relation: { color: theme.inkDim, fontSize: 11.5, marginTop: 2 },
  });
}
