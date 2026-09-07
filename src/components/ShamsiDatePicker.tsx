import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
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

/**
 * A real month-grid calendar in the Jalali (Iranian Shamsi) system —
 * everything is picked in Jalali and converted to/from a stored Gregorian
 * ISO date at the boundary (see src/utils/jalali.ts), so the rest of the
 * app never has to think about which calendar a date came from.
 */
export function ShamsiDatePicker({ visible, title, value, onClose, onChange }: Props) {
  const { t, isRTL } = useI18n();
  const today = todayJalali();
  const selected = isoToJalali(value);

  const [viewYear, setViewYear] = useState(selected?.jy ?? today.jy);
  const [viewMonth, setViewMonth] = useState(selected?.jm ?? today.jm);

  useEffect(() => {
    if (!visible) return;
    const d = isoToJalali(value);
    setViewYear(d?.jy ?? today.jy);
    setViewMonth(d?.jm ?? today.jm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  const changeMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const daysInMonth = jalaliMonthLength(viewYear, viewMonth);
  const leadingBlanks = jalaliWeekdayIndex(viewYear, viewMonth, 1);
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const selectDay = (day: number) => {
    onChange(jalaliToIso(viewYear, viewMonth, day));
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, isRTL && styles.textEnd]}>{title}</Text>

          {/* The glyphs stay put — « ‹ label › » left-to-right, always — because a
              chevron drawn pointing left has to sit on the left to read correctly;
              flipping the row would put a left-pointing arrow on the right and vice
              versa. What flips for RTL is *which action* each position performs:
              since reading flows right-to-left, "forward" belongs on the left. */}
          <View style={styles.nav}>
            <NavButton label="«" onPress={() => setViewYear((y) => (isRTL ? y + 1 : y - 1))} />
            <NavButton label="‹" onPress={() => changeMonth(isRTL ? 1 : -1)} />
            <Text style={styles.navLabel}>
              {JALALI_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
            </Text>
            <NavButton label="›" onPress={() => changeMonth(isRTL ? -1 : 1)} />
            <NavButton label="»" onPress={() => setViewYear((y) => (isRTL ? y - 1 : y + 1))} />
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

          <View style={[styles.footer, isRTL && styles.rowRTL]}>
            <Pressable style={styles.footerButton} onPress={() => { const d = todayJalali(); onChange(jalaliToIso(d.jy, d.jm, d.jd)); onClose(); }}>
              <Text style={styles.footerButtonText}>{t('today')}</Text>
            </Pressable>
            <Pressable style={styles.footerButton} onPress={() => { onChange(undefined); onClose(); }}>
              <Text style={styles.footerButtonText}>{t('clearDate')}</Text>
            </Pressable>
            <Pressable style={styles.footerButton} onPress={onClose}>
              <Text style={styles.footerButtonText}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NavButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.navButton} onPress={onPress}>
      <Text style={styles.navButtonText}>{label}</Text>
    </Pressable>
  );
}

const CELL_SIZE = 38;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: theme.panel, borderRadius: 18, padding: 18, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: theme.stroke },
  title: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  textEnd: { textAlign: 'right' },
  rowRTL: { flexDirection: 'row-reverse' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 10 },
  navButton: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel2 },
  navButtonText: { color: theme.ink, fontSize: 14, fontWeight: '700' },
  navLabel: { color: theme.ink, fontSize: 14.5, fontWeight: '700', marginHorizontal: 8, minWidth: 120, textAlign: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: { width: CELL_SIZE, textAlign: 'center', color: theme.inkFaint, fontSize: 11.5, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayCell: { borderRadius: CELL_SIZE / 2 },
  dayCellSelected: { backgroundColor: theme.lineMarriage },
  dayCellToday: { borderWidth: 1, borderColor: theme.lineMarriage },
  dayText: { color: theme.ink, fontSize: 13.5 },
  dayTextSelected: { color: theme.bg, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, borderTopWidth: 1, borderTopColor: theme.stroke, paddingTop: 12 },
  footerButton: { paddingVertical: 6, paddingHorizontal: 10 },
  footerButtonText: { color: theme.inkDim, fontSize: 12.5, fontWeight: '600' },
});
