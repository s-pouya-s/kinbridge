import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { showAlert } from './alert';
import type { TFunction } from '../i18n';

/** Longest side a stored photo is ever resized to — plenty for a small avatar, small enough to keep AsyncStorage and JSON exports light even with several people's photos. */
const MAX_DIMENSION = 320;
const JPEG_QUALITY = 0.7;

/**
 * Lets the user pick a photo from their library, crops it to a square, and
 * returns it as a `data:image/jpeg;base64,...` URI — never a bare `file://`
 * path, which would only resolve inside this one app install and break the
 * moment the photo rode along in a JSON export to another device (see
 * storage.ts). Resized/compressed on the way in so a full-resolution phone
 * photo doesn't bloat AsyncStorage or every future export.
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
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;
  const uri = result.assets[0].uri;

  if (Platform.OS === 'web') {
    return resizeImageWeb(uri);
  }

  const rendered = await ImageManipulator.manipulate(uri).resize({ width: MAX_DIMENSION }).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  return `data:image/jpeg;base64,${saved.base64}`;
}

/** expo-image-picker's web implementation hands back a browser-local uri (data:/blob:) with no size control of its own — draw it to a canvas at MAX_DIMENSION to get the same bounded, compressed result native gets from expo-image-manipulator. */
function resizeImageWeb(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new (globalThis as any).Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const canvas = (globalThis as any).document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    image.onerror = () => reject(new Error('Failed to load picked image'));
    image.src = uri;
  });
}
