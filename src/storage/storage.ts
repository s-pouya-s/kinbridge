import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { FamilyData } from '../types';
import { normalizeFamilyData } from './migrate';

const STORAGE_KEY = 'kinbridge:family-data:v1';

export async function loadFamilyData(): Promise<FamilyData | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeFamilyData(JSON.parse(raw) as FamilyData);
  } catch {
    return null;
  }
}

export async function saveFamilyData(data: FamilyData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Writes the tree to a JSON file and hands it to the user.
 *
 * expo-file-system's Paths.document and expo-sharing's share sheet are
 * native-only concepts — Paths.document isn't a real writable location in a
 * browser sandbox, and Sharing.isAvailableAsync() just reports unavailable
 * on web, so the native path silently did nothing there. Web gets its own
 * implementation: a Blob downloaded via a throwaway <a download> link, the
 * standard way a web page hands the user a file.
 *
 * The export date is stamped both in the file's own content (`exportedAt`,
 * an extra field alongside people/marriages — normalizeFamilyData just
 * ignores it on the way back in, so re-importing this file round-trips
 * cleanly) and in the filename itself, so exporting more than once doesn't
 * silently overwrite the last file or leave you guessing which is newest.
 */
export async function exportFamilyData(data: FamilyData): Promise<void> {
  const exportedAt = new Date().toISOString();
  const json = JSON.stringify({ ...data, exportedAt }, null, 2);
  const fileName = `kinbridge-export-${exportedAt.slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    const doc = (globalThis as any).document;
    const blob = new (globalThis as any).Blob([json], { type: 'application/json' });
    const url = (globalThis as any).URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName;
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    (globalThis as any).URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.document, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri);
  }
}

/**
 * Lets the user pick a previously exported JSON file, and saves it as the
 * active tree. Returns null if the user cancelled the picker.
 *
 * Web gets its own implementation for the same reason as exportFamilyData:
 * expo-document-picker's result URIs and expo-file-system's File class are
 * built around native file access, not a browser's picked-file Blob.
 */
export async function importFamilyData(): Promise<FamilyData | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const doc = (globalThis as any).document;
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async () => {
        const picked: any = input.files?.[0];
        if (!picked) {
          resolve(null);
          return;
        }
        try {
          const text = await picked.text();
          const data = normalizeFamilyData(JSON.parse(text) as FamilyData);
          await saveFamilyData(data);
          resolve(data);
        } catch {
          resolve(null);
        }
      };
      input.click();
    });
  }

  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
  if (result.canceled || result.assets.length === 0) return null;

  const picked = new File(result.assets[0].uri);
  const text = await picked.text();
  const data = normalizeFamilyData(JSON.parse(text) as FamilyData);
  await saveFamilyData(data);
  return data;
}
