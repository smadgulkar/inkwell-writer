import { nanoid } from 'nanoid';
import { MemoryFs, type FsAdapter } from '../fs/adapter';
import { FolderFs, folderSupported, pickFolder } from '../fs/folder';
import { LocalFs } from '../fs/local';
import { isTauri, joinPath, pathExists, pickTauriFolder, TauriFs } from '../fs/tauri';
import { META_FILE, newProjectFiles, nowIso } from '../model/project';
import type { Mode } from '../model/types';
import { store } from '../store/store';

export const canUseFolders = () => isTauri() || folderSupported();
export const inDesktopApp = () => isTauri();

export function safeFolderName(title: string) {
  return (title.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').replace(/[. ]+$/, '').slice(0, 80) + '.inkwell';
}

// ---------- recent folders (desktop app) ----------

const RECENT_KEY = 'inkwell:recent-folders';

export interface RecentFolder {
  path: string;
  title: string;
  mode: Mode;
  opened: string;
}

export function listRecentFolders(): RecentFolder[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as RecentFolder[]).sort((a, b) => b.opened.localeCompare(a.opened));
  } catch {
    return [];
  }
}

function rememberFolder(f: RecentFolder) {
  try {
    const list = listRecentFolders().filter((x) => x.path !== f.path);
    localStorage.setItem(RECENT_KEY, JSON.stringify([f, ...list].slice(0, 12)));
  } catch {
    /* ignore */
  }
}

export function forgetFolder(path: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(listRecentFolders().filter((x) => x.path !== path)));
  } catch {
    /* ignore */
  }
}

/** Keep the recent list's title and mode current while a folder project is open. */
store.onOpened = (p) => {
  if (p.fs instanceof TauriFs) rememberFolder({ path: p.fs.root, title: p.meta.title, mode: p.meta.mode, opened: nowIso() });
};

// ---------- create / open ----------

async function writeAll(fs: FsAdapter, files: Record<string, string>) {
  // Write the manifest last so a half-written folder is never mistaken for a project.
  for (const [path, text] of Object.entries(files)) if (path !== META_FILE) await fs.write(path, text);
  if (files[META_FILE] !== undefined) await fs.write(META_FILE, files[META_FILE]);
}

/** Ask for a parent folder and create `<title>.inkwell` inside it. */
async function createFolderProject(title: string, files: Record<string, string>): Promise<FsAdapter | null> {
  if (isTauri()) {
    const parent = await pickTauriFolder('Choose where to keep the project');
    if (!parent) return null;
    const root = joinPath(parent, safeFolderName(title));
    if (await pathExists(joinPath(root, META_FILE))) throw new Error(`There is already a project at ${root}. Open it instead, or choose another title.`);
    const fs = new TauriFs(root);
    await writeAll(fs, files);
    return fs;
  }
  const parent = await pickFolder();
  if (!parent) return null;
  const dir = await parent.getDirectoryHandle(safeFolderName(title), { create: true });
  const fs = new FolderFs(dir);
  if (await fs.read(META_FILE)) throw new Error('A project with that name already exists there. Open it instead, or choose another title.');
  await writeAll(fs, files);
  return fs;
}

export async function createProject(title: string, mode: Mode, where: 'folder' | 'browser') {
  const files = newProjectFiles(title.trim() || 'Untitled', mode);
  if (where === 'folder') {
    const fs = await createFolderProject(title, files);
    if (fs) await store.open(fs);
    return !!fs;
  }
  const key = nanoid(10);
  const fs = new LocalFs(key);
  await writeAll(fs, files);
  await store.open(fs, key);
  return true;
}

export async function openTauriPath(path: string) {
  if (!(await pathExists(joinPath(path, META_FILE)))) {
    throw new Error(`No project.yaml in ${path}. Choose the project folder itself (the one ending in .inkwell).`);
  }
  await store.open(new TauriFs(path));
}

export async function openFolderProject() {
  if (isTauri()) {
    const path = await pickTauriFolder('Open a project folder');
    if (path) await openTauriPath(path);
    return;
  }
  const dir = await pickFolder();
  if (!dir) return;
  await store.open(new FolderFs(dir));
}

export async function openLocalProject(key: string) {
  await store.open(new LocalFs(key), key);
}

export async function openDemo() {
  // The sample lives in browser storage so edits persist between visits.
  const key = 'sample-salt-road-v6';
  const fs = new LocalFs(key);
  if (!(await fs.read(META_FILE))) {
    const { demoFiles } = await import('../demo');
    const files = demoFiles();
    await writeAll(fs, files.text);
    for (const [path, b64] of Object.entries(files.binary)) await fs.writeBinary(path, b64);
  }
  await store.open(fs, key);
}

/** Copy a browser-stored project into a real folder and switch to it. */
export async function saveToFolder() {
  const p = store.get().project;
  if (!p || !(p.fs instanceof LocalFs)) return;
  await store.flush();
  const src = p.fs;
  const fs = await createFolderProject(p.meta.title, src.allFiles());
  if (!fs) return;
  for (const [path, b64] of Object.entries(src.allBinary())) await fs.writeBinary?.(path, b64);
  await store.open(fs);
  store.toast(`Saved to “${fs.label}”. Edits now go to that folder.`);
}

export function inMemoryProject(title: string, mode: Mode) {
  return new MemoryFs(newProjectFiles(title, mode));
}
