import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import type { FamilyData } from '../types';

/**
 * Where stored photos live on a phone: card photos (Person.photoUri) and
 * album photos (Person.photos) alike, each its own JPEG in the app's
 * document folder. The tree keeps only the file name, never the full path,
 * which can change when the app is updated. The folder is called "album"
 * because album photos came first; never rename it, or every photo is lost.
 *
 * Keeping photos out of the tree matters: the whole tree is one
 * AsyncStorage entry, and Android can't read an entry back once it passes
 * about 2MB, which a few dozen inline card photos would reach.
 *
 * On web there is no such folder, so a photo stays an inline data: URI.
 */
export function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'album');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Something an <Image> can show, for a stored photo: a card photo or one album entry. */
export function photoSource(entry: string): string {
  return entry.startsWith('data:') ? entry : new File(photoDir(), entry).uri;
}

function newPhotoName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
}

/** Moves a JPEG just made by the image manipulator into the photo folder, and returns its new file name. */
export function keepPhotoFile(uri: string): string {
  const name = newPhotoName();
  new File(uri).moveSync(new File(photoDir(), name));
  return name;
}

/** Writes base64 JPEG data to the photo file `name` (replacing one already there), and returns the name. */
function writePhotoFile(base64: string, name: string): string {
  const file = new File(photoDir(), name);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  return name;
}

/**
 * Every card photo still inline (saved before card photos were files, or
 * just imported) written to its own file, with the tree pointing at the
 * file name. The same object back when nothing changed. A photo that can't
 * be written stays inline, so nothing is ever lost. Phone only.
 *
 * With `projectId` (a saved tree being loaded), each file is named after
 * the tree and the person, so loading the same tree twice at once (the
 * startup cleanup and the trees list both do) writes the same files.
 * Random names there let the cleanup delete the files the tree kept.
 */
export function cardPhotosToFiles(data: FamilyData, projectId?: string): FamilyData {
  if (Platform.OS === 'web' || !data.people.some((p) => p.photoUri?.startsWith('data:'))) return data;
  return {
    ...data,
    people: data.people.map((p) => {
      const uri = p.photoUri;
      if (!uri?.startsWith('data:')) return p;
      const comma = uri.indexOf(',');
      if (comma < 0) return p;
      try {
        const name = projectId ? `card-${projectId}-${p.id}.jpg`.replace(/[^A-Za-z0-9._-]/g, '_') : newPhotoName();
        return { ...p, photoUri: writePhotoFile(uri.slice(comma + 1), name) };
      } catch {
        return p;
      }
    }),
  };
}

/**
 * The other way, for an export file or the PDF: every card photo stored as
 * a file turned back into an inline data: URI. An export file then reads
 * exactly as before, so older app versions can still import it. A photo
 * whose file is missing is left out.
 */
export async function cardPhotosInline(data: FamilyData): Promise<FamilyData> {
  if (Platform.OS === 'web' || !data.people.some((p) => p.photoUri && !p.photoUri.startsWith('data:'))) return data;
  const people = [];
  for (const p of data.people) {
    if (!p.photoUri || p.photoUri.startsWith('data:')) {
      people.push(p);
      continue;
    }
    const file = new File(photoDir(), p.photoUri);
    people.push({ ...p, photoUri: file.exists ? `data:image/jpeg;base64,${await file.base64()}` : undefined });
  }
  return { ...data, people };
}
