import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import type { FamilyData } from '../types';
import { buildTreePdfHtml, type PdfOptions } from './pdfHtml';
import { saveThenOfferShare } from '../utils/saveFile';

/**
 * A4 in points. Android's PDF maker always makes portrait pages, so there
 * the sheets are portrait and each landscape page is turned to fill one
 * (PdfOptions.turnPages); iOS makes real landscape pages.
 */
const LANDSCAPE = { width: 842, height: 595 };
const PORTRAIT = { width: 595, height: 842 };

/**
 * Makes a PDF of one family tree (see buildTreePdfHtml), named after the
 * tree and the date, saves it in a folder the user picks, then offers to
 * share it (see saveThenOfferShare). On web,
 * where there's no share sheet, it opens the browser's print dialog
 * instead, which can save as PDF.
 */
export async function exportTreePdf(data: FamilyData, options: PdfOptions): Promise<void> {
  const turnPages = Platform.OS === 'android';
  const html = buildTreePdfHtml(data, { ...options, turnPages });

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  // No margins: the page styles place everything themselves, edge to edge.
  // The PDF comes back as base64 and is written into the app's own cache
  // under a meaningful name. Reading printToFileAsync's own file instead
  // fails in Expo Go ("missing READ permission"): it lands in a cache folder
  // outside what the app may read.
  const { base64 } = await Print.printToFileAsync({
    html,
    ...(turnPages ? PORTRAIT : LANDSCAPE),
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    base64: true,
  });
  if (!base64) throw new Error('The PDF came back empty');
  const safeName = options.treeName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'family-tree';
  const fileName = `${safeName} ${options.exportedAt.toISOString().slice(0, 10)}.pdf`;
  const named = new File(Paths.cache, fileName);
  if (named.exists) named.delete();
  named.create();
  named.write(base64, { encoding: 'base64' });

  await saveThenOfferShare(named, fileName, 'application/pdf', options.t);
}
