import { MemoryFs, type FsAdapter } from './adapter';

// Browser-only storage for trying the app without a folder: each project lives under a
// localStorage prefix. Good for demos; real projects should use a folder.

const INDEX_KEY = 'inkwell:projects';

export interface LocalProjectInfo {
  key: string;
  title: string;
  mode: 'novel' | 'short';
  updated: string;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    throw new Error('Browser storage is full or blocked. Save the project to a folder instead.', { cause: e });
  }
}

export function listLocalProjects(): LocalProjectInfo[] {
  try {
    return (JSON.parse(safeGet(INDEX_KEY) || '[]') as LocalProjectInfo[]).sort((a, b) => b.updated.localeCompare(a.updated));
  } catch {
    return [];
  }
}

export function touchLocalProject(info: LocalProjectInfo) {
  const list = listLocalProjects().filter((p) => p.key !== info.key);
  list.push(info);
  safeSet(INDEX_KEY, JSON.stringify(list));
}

export function deleteLocalProject(key: string) {
  const prefixes = [`inkwell:fs:${key}:`, `inkwell:bin:${key}:`];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
  safeSet(INDEX_KEY, JSON.stringify(listLocalProjects().filter((p) => p.key !== key)));
}

export class LocalFs implements FsAdapter {
  kind = 'local' as const;
  label = 'This browser';
  private mem = new MemoryFs();
  private prefix: string;
  private binPrefix: string;

  constructor(public key: string) {
    this.prefix = `inkwell:fs:${key}:`;
    this.binPrefix = `inkwell:bin:${key}:`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(this.prefix)) this.mem.files.set(k.slice(this.prefix.length), localStorage.getItem(k) ?? '');
        else if (k?.startsWith(this.binPrefix)) this.mem.binary.set(k.slice(this.binPrefix.length), localStorage.getItem(k) ?? '');
      }
    } catch {
      /* storage unavailable: run in memory */
    }
  }
  read(path: string) {
    return this.mem.read(path);
  }
  async write(path: string, data: string) {
    await this.mem.write(path, data);
    safeSet(this.prefix + path, data);
  }
  list(dir: string) {
    return this.mem.list(dir);
  }
  readBinary(path: string) {
    return this.mem.readBinary(path);
  }
  async writeBinary(path: string, base64: string) {
    await this.mem.writeBinary(path, base64);
    safeSet(this.binPrefix + path, base64);
  }
  allBinary(): Record<string, string> {
    return Object.fromEntries(this.mem.binary);
  }
  async remove(path: string) {
    await this.mem.remove(path);
    try {
      localStorage.removeItem(this.prefix + path);
      localStorage.removeItem(this.binPrefix + path);
    } catch {
      /* ignore */
    }
  }
  /** Every file, for "save to folder" export. */
  allFiles(): Record<string, string> {
    return Object.fromEntries(this.mem.files);
  }
}
