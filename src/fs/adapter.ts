/**
 * Storage abstraction. Paths are always relative to the project root and use "/".
 * Implementations: memory/localStorage (browser), File System Access folder (Chrome/Edge),
 * Tauri filesystem (desktop app).
 */
export interface FsAdapter {
  readonly kind: 'local' | 'folder' | 'tauri' | 'memory';
  /** Human label for where the project lives, e.g. a folder name. */
  readonly label: string;
  read(path: string): Promise<string | null>;
  write(path: string, data: string): Promise<void>;
  /** File names (not paths) directly inside a directory. Missing directory = []. */
  list(dir: string): Promise<string[]>;
  remove(path: string): Promise<void>;
  /** Binary files (images) as base64. */
  readBinary(path: string): Promise<string | null>;
  writeBinary(path: string, base64: string): Promise<void>;
}

export function join(...parts: string[]) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

/** In-memory adapter, used by tests and as a base for the localStorage adapter. */
export class MemoryFs implements FsAdapter {
  kind: FsAdapter['kind'] = 'memory';
  label = 'Memory';
  files = new Map<string, string>();
  binary = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    if (initial) for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  async read(path: string) {
    return this.files.get(path) ?? null;
  }
  async write(path: string, data: string) {
    this.files.set(path, data);
  }
  async list(dir: string) {
    const prefix = dir.replace(/\/$/, '') + '/';
    const names = new Set<string>();
    for (const p of this.files.keys()) {
      if (p.startsWith(prefix)) {
        const rest = p.slice(prefix.length);
        if (!rest.includes('/')) names.add(rest);
      }
    }
    return [...names].sort();
  }
  async remove(path: string) {
    this.files.delete(path);
    this.binary.delete(path);
  }
  async readBinary(path: string) {
    return this.binary.get(path) ?? null;
  }
  async writeBinary(path: string, base64: string) {
    this.binary.set(path, base64);
  }
}

export function base64FromBytes(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

export function bytesFromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
