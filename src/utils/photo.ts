import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { showAlert } from './alert';
import { keepPhotoFile } from './photoFiles';
import type { TFunction } from '../i18n';

/** Longest side a card photo is resized to: plenty for a card, small enough to keep JSON exports light. */
const MAX_DIMENSION = 320;
const JPEG_QUALITY = 0.7;

/**
 * Lets the user pick a photo from their library, crops it to a square,
 * resizes and compresses it, and returns the new Person.photoUri: on a
 * phone the file name of its own JPEG in the photo folder (see
 * photoFiles.ts; show it with photoSource), on web an inline
 * `data:image/jpeg;base64,...` URI.
 *
 * Returns null if the user cancels, or doesn't grant photo-library access.
 */
export async function pickPersonPhoto(t: TFunction): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert(t('photoPermissionDenied'));
      return null;
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    // Must stay 1 (PICK_QUALITY): see there.
    quality: PICK_QUALITY,
  });
  if (result.canceled || !result.assets[0]) return null;
  const uri = result.assets[0].uri;

  try {
    if (Platform.OS === 'web') {
      return await resizeImageWeb(uri, MAX_DIMENSION, JPEG_QUALITY);
    }
    const rendered = await ImageManipulator.manipulate(uri).resize({ width: MAX_DIMENSION }).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    return keepPhotoFile(saved.uri);
  } catch {
    showAlert(t('photoFailed'));
    return null;
  }
}

/**
 * The quality both photo pickers ask for. Below 1, expo-image-picker on
 * Android decodes the whole original photo (about 200MB for a 50MP photo)
 * just to save it again, before we decode it a second time to shrink it.
 * With a big tree already using a lot of memory, that killed the app right
 * after a photo was picked. At 1 it hands back the file as is, and the
 * resize step does all the compressing.
 */
export const PICK_QUALITY = 1;

/** expo-image-picker's web implementation hands back a browser-local uri (data:/blob:) with no size control of its own — draw it to a canvas at maxDimension to get the same bounded, compressed result native gets from expo-image-manipulator. */
export function resizeImageWeb(uri: string, maxDimension: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new (globalThis as any).Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const canvas = (globalThis as any).document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => reject(new Error('Failed to load picked image'));
    image.src = uri;
  });
}
