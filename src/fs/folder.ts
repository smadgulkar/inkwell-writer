import { base64FromBytes, bytesFromBase64, type FsAdapter } from './adapter';

// Real folders in Chromium browsers via the File System Access API.
// Point it at a folder inside Google Drive / Dropbox / OneDrive and the sync client does the rest.

type DirHandle = FileSystemDirectoryHandle;

export function folderSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickFolder(): Promise<DirHandle | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'inkwell-project' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    throw e;
  }
}

export class FolderFs implements FsAdapter {
  kind = 'folder' as const;
  label: string;

  constructor(private root: DirHandle) {
    this.label = root.name;
  }

  private async dir(parts: string[], create: boolean): Promise<DirHandle | null> {
    let d = this.root;
    for (const p of parts) {
      try {
        d = await d.getDirectoryHandle(p, { create });
      } catch (e) {
        if ((e as DOMException).name === 'NotFoundError') return null;
        throw e;
      }
    }
    return d;
  }

  private split(path: string) {
    const parts = path.split('/').filter(Boolean);
    return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
  }

  async read(path: string) {
    const { dirs, name } = this.split(path);
    const d = await this.dir(dirs, false);
    if (!d) return null;
    try {
      const fh = await d.getFileHandle(name);
      return await (await fh.getFile()).text();
    } catch (e) {
      if ((e as DOMException).name === 'NotFoundError') return null;
      throw e;
    }
  }

  async readBinary(path: string) {
    const { dirs, name } = this.split(path);
    const d = await this.dir(dirs, false);
    if (!d) return null;
    try {
      const fh = await d.getFileHandle(name);
      return base64FromBytes(new Uint8Array(await (await fh.getFile()).arrayBuffer()));
    } catch (e) {
      if ((e as DOMException).name === 'NotFoundError') return null;
      throw e;
    }
  }

  async writeBinary(path: string, base64: string) {
    const { dirs, name } = this.split(path);
    const d = (await this.dir(dirs, true))!;
    const fh = await d.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(bytesFromBase64(base64) as unknown as BufferSource);
    await w.close();
  }

  async write(path: string, data: string) {
    const { dirs, name } = this.split(path);
    const d = (await this.dir(dirs, true))!;
    const fh = await d.getFileHandle(name, { create: true });
    // createWritable writes to a swap file and swaps on close: an atomic save.
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  }

  async list(dir: string) {
    const d = await this.dir(dir.split('/').filter(Boolean), false);
    if (!d) return [];
    const names: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, handle] of (d as any).entries()) if (handle.kind === 'file') names.push(name);
    return names.sort();
  }

  async remove(path: string) {
    const { dirs, name } = this.split(path);
    const d = await this.dir(dirs, false);
    if (!d) return;
    try {
      await d.removeEntry(name);
    } catch (e) {
      if ((e as DOMException).name !== 'NotFoundError') throw e;
    }
  }
}
