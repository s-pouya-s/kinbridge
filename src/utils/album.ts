import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { showAlert } from './alert';
import { PICK_QUALITY, resizeImageWeb } from './photo';
import { keepPhotoFile, photoDir } from './photoFiles';
import type { TFunction } from '../i18n';
import type { FamilyData } from '../types';

/**
 * A person's photo album (Person.photos), kept apart from the family data
 * itself like card photos are: on a phone each album photo is its own JPEG
 * in the photo folder and the tree stores only its file name; on web it's
 * an inline data: URI. See photoFiles.ts, and photoSource to show one.
 *
 * An export carries the files along inside the JSON (see storage.ts), so a
 * tree moved to another phone keeps its albums.
 */

/** Longest side an album photo is resized to: sharp full screen on a phone, still only a few hundred KB. */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

/**
 * Lets the user pick one or more photos from their library and returns
 * their new Person.photos entries, in the order picked. An empty list if
 * they cancel or don't grant photo-library access.
 */
export async function pickAlbumPhotos(t: TFunction): Promise<string[]> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert(t('photoPermissionDenied'));
      return [];
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: PICK_QUALITY });
  if (result.canceled) return [];

  const entries: string[] = [];
  let failed = false;
  for (const asset of result.assets) {
    try {
      if (Platform.OS === 'web') {
        entries.push(await resizeImageWeb(asset.uri, MAX_DIMENSION, JPEG_QUALITY));
        continue;
      }
      const landscape = asset.width >= asset.height;
      const resize = landscape ? { width: Math.min(asset.width, MAX_DIMENSION) } : { height: Math.min(asset.height, MAX_DIMENSION) };
      const rendered = await ImageManipulator.manipulate(asset.uri).resize(resize).renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
      entries.push(keepPhotoFile(saved.uri));
    } catch {
      // Keep the photos that worked; say once that some didn't.
      failed = true;
    }
  }
  if (failed) showAlert(t('photoFailed'));
  return entries;
}

/** Every album photo stored as a file (not inline), keyed by file name, as base64 — for an export. */
export async function readAlbumFiles(data: FamilyData): Promise<Record<string, string>> {
  if (Platform.OS === 'web') return {};
  const files: Record<string, string> = {};
  for (const person of data.people) {
    for (const entry of person.photos ?? []) {
      if (entry.startsWith('data:') || entry in files) continue;
      const file = new File(photoDir(), entry);
      if (file.exists) files[entry] = await file.base64();
    }
  }
  return files;
}

/**
 * The other half of readAlbumFiles, on import. On a phone each photo is
 * written back to its own file; on web, which can't, every file entry in
 * the tree is swapped for the inline data: URI of the same photo.
 */
export function writeAlbumFiles(data: FamilyData, files: Record<string, string> | undefined): FamilyData {
  if (!files || Object.keys(files).length === 0) return data;
  if (Platform.OS === 'web') {
    return {
      ...data,
      people: data.people.map((p) =>
        p.photos ? { ...p, photos: p.photos.map((entry) => (files[entry] ? `data:image/jpeg;base64,${files[entry]}` : entry)) } : p
      ),
    };
  }
  // Only the photos this tree actually uses; a file can carry several trees.
  for (const name of new Set(data.people.flatMap((p) => p.photos ?? []))) {
    const base64 = files[name];
    if (!base64) continue;
    const file = new File(photoDir(), name);
    if (file.exists) continue;
    file.create();
    file.write(base64, { encoding: 'base64' });
  }
  return data;
}

/**
 * Deletes photo files nothing points to any more: a card photo replaced or
 * removed, a photo removed from an album, or one left behind by a deleted
 * person or tree. Every tree's photos share one
 * folder, so this must be given all of them, never just the one that's
 * open. Run once when the app opens, when no edit form can be holding a
 * just-picked photo that isn't saved yet.
 */
export function pruneAlbumFiles(trees: FamilyData[]): void {
  if (Platform.OS === 'web') return;
  const inUse = new Set(trees.flatMap((data) => data.people.flatMap((p) => [...(p.photos ?? []), ...(p.photoUri ? [p.photoUri] : [])])));
  for (const entry of photoDir().list()) {
    if (entry instanceof File && !inUse.has(entry.name)) entry.delete();
  }
}
