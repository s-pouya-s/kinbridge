import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAY_SHORT,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
  jalaliWeekdayIndex,
  toPersianDigits,
  todayJalali,
  type IsoDate,
} from '../utils/jalali';

interface Props {
  visible: boolean;
  title: string;
  value?: IsoDate;
  onClose: () => void;
  onChange: (iso: IsoDate | undefined) => void;
}

/** How far past/before the current year the year dropdown offers — wide enough for anyone's birth/death date. */
const YEAR_RANGE_PAST = 150;
const YEAR_RANGE_FUTURE = 10;
const YEAR_ROW_HEIGHT = 44;

/**
 * A real month-grid calendar in the Jalali (Iranian Shamsi) system —
 * everything is picked in Jalali and converted to/from a stored Gregorian
 * ISO date at the boundary (see src/utils/jalali.ts), so the rest of the
 * app never has to think about which calendar a date came from.
 *
 * The month/year header are dropdowns, not step arrows — stepping a
 * hundred-plus years one at a time to reach an old birth date was the
 * exact complaint this replaced.
 */
export function ShamsiDatePicker({ visible, title, value, onClose, onChange }: Props) {
  const { t, isRTL } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = todayJalali();
  const selected = isoToJalali(value);

  const [viewYear, setViewYear] = useState(selected?.jy ?? today.jy);
  const [viewMonth, setViewMonth] = useState(selected?.jm ?? today.jm);
  const [pickerView, setPickerView] = useState<'days' | 'months' | 'years'>('days');
  const yearListRef = useRef<ScrollView>(null);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = today.jy + YEAR_RANGE_FUTURE; y >= today.jy - YEAR_RANGE_PAST; y--) list.push(y);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    const d = isoToJalali(value);
    setViewYear(d?.jy ?? today.jy);
    setViewMonth(d?.jm ?? today.jm);
    setPickerView('days');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  const daysInMonth = jalaliMonthLength(viewYear, viewMonth);
  const leadingBlanks = jalaliWeekdayIndex(viewYear, viewMonth, 1);
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const selectDay = (day: number) => {
    onChange(jalaliToIso(viewYear, viewMonth, day));
    onClose();
  };

  const openYearList = () => {
    setPickerView('years');
    const index = years.indexOf(viewYear);
    if (index >= 0) {
      // A moment after the list actually mounts, so scrollTo has something to act on.
      requestAnimationFrame(() => yearListRef.current?.scrollTo({ y: Math.max(0, index * YEAR_ROW_HEIGHT - YEAR_ROW_HEIGHT * 2), animated: false }));
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Sibling, not wrapping, Pressable for backdrop-dismiss — see
          PersonSheet's comment on why nesting a ScrollView inside a
          Pressable makes scrolling fight the backdrop for touch-responder
          status (the year list below is exactly that kind of ScrollView). */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={[styles.title, isRTL && styles.textEnd]}>{title}</Text>

          {pickerView === 'days' && (
            <>
              <View style={[styles.nav, isRTL && styles.rowRTL]}>
                <Pressable style={styles.dropdownButton} onPress={() => setPickerView('months')}>
                  <Text style={styles.dropdownButtonText}>{JALALI_MONTH_NAMES[viewMonth - 1]}</Text>
                  <Text style={styles.dropdownCaret}>▾</Text>
                </Pressable>
                <Pressable style={styles.dropdownButton} onPress={openYearList}>
                  <Text style={styles.dropdownButtonText}>{toPersianDigits(viewYear)}</Text>
                  <Text style={styles.dropdownCaret}>▾</Text>
                </Pressable>
              </View>

              {/* Persian calendars conventionally run Saturday-on-the-right,
                  Friday-on-the-left — row-reverse mirrors both the header and
                  the grid together so the weekday columns still line up. */}
              <View style={[styles.weekRow, isRTL && styles.rowRTL]}>
                {JALALI_WEEKDAY_SHORT.map((w, i) => (
                  <Text key={i} style={styles.weekLabel}>{w}</Text>
                ))}
              </View>

              <View style={[styles.grid, isRTL && styles.rowRTL]}>
                {cells.map((day, i) => {
                  if (day == null) return <View key={i} style={styles.cell} />;
                  const isSelected = !!selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === day;
                  const isToday = today.jy === viewYear && today.jm === viewMonth && today.jd === day;
                  return (
                    <Pressable
                      key={i}
                      style={[styles.cell, styles.dayCell, isSelected && styles.dayCellSelected, !isSelected && isToday && styles.dayCellToday]}
                      onPress={() => selectDay(day)}
                    >
                      <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{toPersianDigits(day)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {pickerView === 'months' && (
            <View style={styles.monthGrid}>
              {JALALI_MONTH_NAMES.map((name, i) => {
                const monthNum = i + 1;
                const isActive = monthNum === viewMonth;
                return (
                  <Pressable
                    key={name}
                    style={[styles.monthCell, isActive && styles.monthCellActive]}
                    onPress={() => {
                      setViewMonth(monthNum);
                      setPickerView('days');
                    }}
                  >
                    <Text style={[styles.monthCellText, isActive && styles.monthCellTextActive]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {pickerView === 'years' && (
            <ScrollView ref={yearListRef} style={styles.yearList} keyboardShouldPersistTaps="handled">
              {years.map((y) => {
                const isActive = y === viewYear;
                return (
                  <Pressable
                    key={y}
                    style={[styles.yearRow, isActive && styles.yearRowActive]}
                    onPress={() => {
                      setViewYear(y);
                      setPickerView('days');
                    }}
                  >
                    <Text style={[styles.yearRowText, isActive && styles.yearRowTextActive]}>{toPersianDigits(y)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={[styles.footer, isRTL && styles.rowRTL]}>
            {pickerView === 'days' ? (
              <>
                <Pressable style={styles.footerButton} onPress={() => { const d = todayJalali(); onChange(jalaliToIso(d.jy, d.jm, d.jd)); onClose(); }}>
                  <Text style={styles.footerButtonText}>{t('today')}</Text>
                </Pressable>
                <Pressable style={styles.footerButton} onPress={() => { onChange(undefined); onClose(); }}>
                  <Text style={styles.footerButtonText}>{t('clearDate')}</Text>
                </Pressable>
                <Pressable style={styles.footerButton} onPress={onClose}>
                  <Text style={styles.footerButtonText}>{t('cancel')}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.footerButton} onPress={() => setPickerView('days')}>
                <Text style={styles.footerButtonText}>{t('cancel')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CELL_SIZE = 38;

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: theme.panel, borderRadius: 18, padding: 18, width: '100%', maxWidth: 340, maxHeight: '80%', borderWidth: 1, borderColor: theme.stroke },
  title: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  textEnd: { textAlign: 'right', writingDirection: 'rtl' },
  rowRTL: { flexDirection: 'row-reverse' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.panel2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dropdownButtonText: { color: theme.ink, fontSize: 14.5, fontWeight: '700' },
  dropdownCaret: { color: theme.inkFaint, fontSize: 11 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: { width: CELL_SIZE, textAlign: 'center', color: theme.inkFaint, fontSize: 11.5, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayCell: { borderRadius: CELL_SIZE / 2 },
  dayCellSelected: { backgroundColor: theme.lineMarriage },
  dayCellToday: { borderWidth: 1, borderColor: theme.lineMarriage },
  dayText: { color: theme.ink, fontSize: 13.5 },
  dayTextSelected: { color: theme.bg, fontWeight: '700' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  monthCell: {
    width: '31%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: theme.panel2,
  },
  monthCellActive: { backgroundColor: theme.lineMarriage },
  monthCellText: { color: theme.ink, fontSize: 13.5, fontWeight: '600' },
  monthCellTextActive: { color: theme.bg },
  yearList: { maxHeight: 320 },
  yearRow: { height: YEAR_ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  yearRowActive: { backgroundColor: theme.lineMarriage },
  yearRowText: { color: theme.ink, fontSize: 15 },
  yearRowTextActive: { color: theme.bg, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, borderTopWidth: 1, borderTopColor: theme.stroke, paddingTop: 12 },
  footerButton: { paddingVertical: 6, paddingHorizontal: 10 },
  footerButtonText: { color: theme.inkDim, fontSize: 12.5, fontWeight: '600' },
  });
}
