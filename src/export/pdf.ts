import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { FamilyData } from '../types';
import { buildTreePdfHtml, type PdfOptions } from './pdfHtml';

/** A4 landscape, in points: the size buildTreePdfHtml's page styles are laid out for. */
const PAGE = { width: 842, height: 595 };

/**
 * Makes a PDF of one family tree (see buildTreePdfHtml) and hands it to the
 * user through the share sheet, named after the tree and the date. On web,
 * where there's no share sheet, it opens the browser's print dialog
 * instead, which can save as PDF.
 */
export async function exportTreePdf(data: FamilyData, options: PdfOptions): Promise<void> {
  const html = buildTreePdfHtml(data, options);

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, ...PAGE });
  // printToFileAsync picks a random name in the cache; give the file a
  // meaningful one before it's shared.
  const safeName = options.treeName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'family-tree';
  const named = new File(Paths.cache, `${safeName} ${options.exportedAt.toISOString().slice(0, 10)}.pdf`);
  if (named.exists) named.delete();
  new File(uri).moveSync(named);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
