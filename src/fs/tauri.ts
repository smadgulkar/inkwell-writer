import type { FsAdapter } from './adapter';

// Desktop filesystem through Inkwell's own Tauri commands (src-tauri/src/lib.rs).
// They work in any folder the user picks, with no permission scopes to configure.

interface TauriInternals {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

const internals = (): TauriInternals | undefined =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof window !== 'undefined' ? (window as any).__TAURI_INTERNALS__ : undefined;

export function isTauri(): boolean {
  return typeof internals()?.invoke === 'function';
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const t = internals();
  if (!t) return Promise.reject(new Error('Not running in the desktop app.'));
  return t.invoke<T>(cmd, args).catch((e: unknown) => {
    throw new Error(typeof e === 'string' ? e : (e as Error)?.message ?? String(e));
  });
}

/** Ask the user for a folder. Returns its absolute path, or null if they cancel. */
export async function pickTauriFolder(title = 'Choose a folder'): Promise<string | null> {
  const res = await invoke<string | string[] | null>('plugin:dialog|open', { options: { directory: true, multiple: false, title } });
  if (Array.isArray(res)) return res[0] ?? null;
  return typeof res === 'string' ? res : null;
}

export function pathExists(path: string) {
  return invoke<boolean>('path_exists', { path });
}

export function joinPath(root: string, rel: string) {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const base = root.replace(/[\\/]+$/, '');
  return [base, ...rel.split('/').filter(Boolean)].join(sep);
}

export class TauriFs implements FsAdapter {
  kind = 'tauri' as const;
  label: string;

  constructor(public root: string) {
    this.label = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
  }

  private abs(path: string) {
    return joinPath(this.root, path);
  }

  read(path: string) {
    return invoke<string | null>('read_text', { path: this.abs(path) });
  }
  write(path: string, data: string) {
    return invoke<void>('write_text', { path: this.abs(path), contents: data });
  }
  list(dir: string) {
    return invoke<string[]>('list_files', { path: this.abs(dir) });
  }
  remove(path: string) {
    return invoke<void>('remove_file', { path: this.abs(path) });
  }
  readBinary(path: string) {
    return invoke<string | null>('read_base64', { path: this.abs(path) });
  }
  writeBinary(path: string, base64: string) {
    return invoke<void>('write_base64', { path: this.abs(path), data: base64 });
  }
}

/** Ask where to save a file, then write it. Returns the chosen path, or null if cancelled. */
export async function saveTauriFile(defaultName: string, filter: { name: string; extensions: string[] }, base64: string): Promise<string | null> {
  const path = await invoke<string | null>('plugin:dialog|save', { options: { title: 'Export', defaultPath: defaultName, filters: [filter] } });
  if (!path) return null;
  await invoke('write_base64', { path, data: base64 });
  return path;
}
