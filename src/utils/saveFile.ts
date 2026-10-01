import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Directory, File } from 'expo-file-system';
import type { TFunction } from '../i18n';

/** iOS's names for the file types this app saves, so the share sheet offers the right apps. */
const UTIS: Record<string, string> = { 'application/pdf': 'com.adobe.pdf', 'application/json': 'public.json' };

/**
 * Asks the user for a folder on the device, saves a copy of `source` there
 * under `fileName`, then offers to share it as well. Nothing is saved if
 * they close the folder picker. Native only: web saves by download.
 *
 * Sharing hands over `source` itself (a file in the app's own storage)
 * rather than the saved copy, since a folder picked through Android's
 * storage picker gives a content:// address that not every app can open.
 */
export async function saveThenOfferShare(source: File, fileName: string, mimeType: string, t: TFunction): Promise<void> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (err) {
    if (/cancel/i.test(String(err))) return;
    throw err;
  }

  const saved = folder.createFile(fileName, mimeType);
  saved.write(await source.bytes());

  const canShare = await Sharing.isAvailableAsync();
  Alert.alert(t('fileSavedTitle'), t('fileSavedMessage', { name: saved.name || fileName, folder: folder.name }), [
    { text: t('done'), style: 'cancel' },
    ...(canShare
      ? [{ text: t('share'), onPress: () => Sharing.shareAsync(source.uri, { mimeType, UTI: UTIS[mimeType] }).catch(() => {}) }]
      : []),
  ]);
}
