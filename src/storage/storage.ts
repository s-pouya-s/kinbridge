import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { FamilyData } from '../types';
import { normalizeFamilyData } from './migrate';
import { readAlbumFiles, writeAlbumFiles } from '../utils/album';

const STORAGE_KEY = 'kinbridge:family-data:v1';
const PROJECTS_KEY = 'kinbridge:projects:v1';

/**
 * The app holds several separate family trees ("projects"), each saved
 * under its own AsyncStorage key; this index lists them and remembers which
 * one was open last. The tree from before projects existed simply becomes
 * the project with this id, still saved under the original key, so nothing
 * has to be moved or copied on upgrade.
 */
const FIRST_PROJECT_ID = 'default';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectIndex {
  activeId: string;
  projects: Project[];
}

const dataKey = (projectId: string) => (projectId === FIRST_PROJECT_ID ? STORAGE_KEY : `${STORAGE_KEY}:${projectId}`);

/** The list of trees. The very first time (a fresh install, or an upgrade from before projects), a single project named `firstName`. */
export async function loadProjectIndex(firstName: string): Promise<ProjectIndex> {
  const raw = await AsyncStorage.getItem(PROJECTS_KEY);
  if (raw) {
    try {
      const index = JSON.parse(raw) as ProjectIndex;
      if (index.projects.length > 0) {
        return index.projects.some((p) => p.id === index.activeId) ? index : { ...index, activeId: index.projects[0].id };
      }
    } catch {
      // Fall through and start over with a fresh index; the trees themselves are untouched.
    }
  }
  const index: ProjectIndex = { activeId: FIRST_PROJECT_ID, projects: [{ id: FIRST_PROJECT_ID, name: firstName, createdAt: new Date().toISOString() }] };
  await saveProjectIndex(index);
  return index;
}

export async function saveProjectIndex(index: ProjectIndex): Promise<void> {
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(index));
}

export function newProjectId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function loadFamilyData(projectId: string): Promise<FamilyData | null> {
  const raw = await AsyncStorage.getItem(dataKey(projectId));
  if (!raw) return null;
  try {
    return normalizeFamilyData(JSON.parse(raw) as FamilyData);
  } catch {
    return null;
  }
}

export async function saveFamilyData(projectId: string, data: FamilyData): Promise<void> {
  await AsyncStorage.setItem(dataKey(projectId), JSON.stringify(data));
}

export async function deleteFamilyData(projectId: string): Promise<void> {
  await AsyncStorage.removeItem(dataKey(projectId));
}

/** One tree going into, or coming out of, an export file. */
export interface ExportTree {
  name: string;
  data: FamilyData;
}

/**
 * Writes the chosen trees to one JSON file and hands it to the user.
 *
 * The file holds a list of trees, each with its name, plus every album photo
 * any of them uses: those live in their own files (see utils/album.ts), so
 * they ride along here as base64, keyed by file name, and pickImportFile
 * reads them back.
 *
 * expo-file-system's Paths.document and expo-sharing's share sheet are
 * native-only concepts, so web gets its own implementation: a Blob
 * downloaded via a throwaway <a download> link, the standard way a web page
 * hands the user a file. The export date is in both the content and the
 * filename, so exporting more than once never silently overwrites the last
 * file.
 */
export async function exportTrees(trees: ExportTree[]): Promise<void> {
  const exportedAt = new Date().toISOString();
  const albumFiles: Record<string, string> = {};
  for (const tree of trees) Object.assign(albumFiles, await readAlbumFiles(tree.data));
  const json = JSON.stringify({ kinbridgeExport: 2, exportedAt, trees: trees.map((tree) => ({ name: tree.name, ...tree.data })), albumFiles }, null, 2);
  const baseName = trees.length === 1 ? trees[0].name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'family-tree' : 'family-trees';
  const fileName = `${baseName} ${exportedAt.slice(0, 10)}.json`;

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

/** What an export file holds: its trees, and the album photos they use (see exportTrees). */
export interface ImportFile {
  trees: ExportTree[];
  albumFiles: Record<string, string>;
}

/**
 * Lets the user pick a previously exported JSON file and reads every tree in
 * it, without saving anything yet: the caller asks which ones to bring in,
 * then saves each as a new tree with importedTreeData. Null if the user
 * cancelled the picker.
 *
 * Web gets its own implementation for the same reason as exportTrees:
 * expo-document-picker's result URIs and expo-file-system's File class are
 * built around native file access, not a browser's picked-file Blob.
 */
export async function pickImportFile(): Promise<ImportFile | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
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
          resolve(readExport(JSON.parse(await picked.text())));
        } catch (err) {
          reject(err);
        }
      };
      input.click();
    });
  }

  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
  if (result.canceled || result.assets.length === 0) return null;
  const text = await new File(result.assets[0].uri).text();
  return readExport(JSON.parse(text));
}

/** One chosen tree from an import file, ready to save: its album photos written back out (only the ones it uses). */
export function importedTreeData(tree: ExportTree, albumFiles: Record<string, string>): FamilyData {
  return writeAlbumFiles(tree.data, albumFiles);
}

/** The error pickImportFile throws for a file that isn't one of this app's exports, so the caller can say so plainly. */
export const NOT_AN_EXPORT = 'not-a-kinbridge-export';

type RawTree = FamilyData & { name?: string };

/** Reads a file written by exportTrees; anything else is refused rather than half-imported. */
function readExport(parsed: any): ImportFile {
  if (parsed?.kinbridgeExport !== 2 || !Array.isArray(parsed.trees)) throw new Error(NOT_AN_EXPORT);
  const trees = (parsed.trees as RawTree[]).map((tree) => ({
    name: (tree.name ?? '').trim(),
    data: normalizeFamilyData({ people: tree.people ?? [], marriages: tree.marriages ?? [] }),
  }));
  return { trees, albumFiles: parsed.albumFiles ?? {} };
}
