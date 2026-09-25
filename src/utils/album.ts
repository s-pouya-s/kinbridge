import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { showAlert } from './alert';
import { resizeImageWeb } from './photo';
import type { TFunction } from '../i18n';
import type { FamilyData } from '../types';

/**
 * A person's photo album (Person.photos), kept apart from the family data
 * itself. The whole tree is saved as one AsyncStorage entry, which Android
 * can't read back once it passes about 2MB, and a handful of photos would
 * blow through that. So on a phone each album photo is its own JPEG in the
 * app's document folder, and the tree only stores its file name (never the
 * full path, which can change when the app is updated). On web, which has
 * no such folder, a photo is stored inline as a data: URI instead, the same
 * as the card's own avatar photo. An entry is one or the other; see
 * albumPhotoUri.
 *
 * An export carries the files along inside the JSON (see storage.ts), so a
 * tree moved to another phone keeps its albums.
 */

/** Longest side an album photo is resized to: sharp full screen on a phone, still only a few hundred KB. */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

function albumDir(): Directory {
  const dir = new Directory(Paths.document, 'album');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Something an <Image> can show, for one Person.photos entry. */
export function albumPhotoUri(entry: string): string {
  return entry.startsWith('data:') ? entry : new File(albumDir(), entry).uri;
}

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

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
  if (result.canceled) return [];

  const entries: string[] = [];
  for (const asset of result.assets) {
    if (Platform.OS === 'web') {
      entries.push(await resizeImageWeb(asset.uri, MAX_DIMENSION, JPEG_QUALITY));
      continue;
    }
    const landscape = asset.width >= asset.height;
    const resize = landscape ? { width: Math.min(asset.width, MAX_DIMENSION) } : { height: Math.min(asset.height, MAX_DIMENSION) };
    const rendered = await ImageManipulator.manipulate(asset.uri).resize(resize).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    new File(saved.uri).moveSync(new File(albumDir(), name));
    entries.push(name);
  }
  return entries;
}

/** Every album photo stored as a file (not inline), keyed by file name, as base64 — for an export. */
export async function readAlbumFiles(data: FamilyData): Promise<Record<string, string>> {
  if (Platform.OS === 'web') return {};
  const files: Record<string, string> = {};
  for (const person of data.people) {
    for (const entry of person.photos ?? []) {
      if (entry.startsWith('data:') || entry in files) continue;
      const file = new File(albumDir(), entry);
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
    const file = new File(albumDir(), name);
    if (file.exists) continue;
    file.create();
    file.write(base64, { encoding: 'base64' });
  }
  return data;
}

/**
 * Deletes photo files nothing points to any more: removed from an album,
 * or left behind by a deleted person or tree. Every tree's photos share one
 * folder, so this must be given all of them, never just the one that's
 * open. Run once when the app opens, when no edit form can be holding a
 * just-picked photo that isn't saved yet.
 */
export function pruneAlbumFiles(trees: FamilyData[]): void {
  if (Platform.OS === 'web') return;
  const inUse = new Set(trees.flatMap((data) => data.people.flatMap((p) => p.photos ?? [])));
  for (const entry of albumDir().list()) {
    if (entry instanceof File && !inUse.has(entry.name)) entry.delete();
  }
}
