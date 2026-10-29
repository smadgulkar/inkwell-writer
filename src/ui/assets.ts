import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { base64FromBytes, bytesFromBase64, type FsAdapter } from '../fs/adapter';
import { LocalFs } from '../fs/local';
import { IMAGE_TYPES, mimeFor } from '../model/maps';
import { ASSETS_DIR } from '../model/project';
import { store, useStore } from '../store/store';

// Images live in the project's assets/ folder, so they sync with everything else.
// The UI shows them through blob URLs, cached per project and path.

let cacheFs: FsAdapter | null = null;
const cache = new Map<string, Promise<string | null>>();

function urlFor(path: string): Promise<string | null> {
  const fs = store.get().project?.fs ?? null;
  if (fs !== cacheFs) {
    for (const p of cache.values()) void p.then((u) => u && URL.revokeObjectURL(u));
    cache.clear();
    cacheFs = fs;
  }
  if (!fs) return Promise.resolve(null);
  let hit = cache.get(path);
  if (!hit) {
    hit = fs
      .readBinary(path)
      .then((b64) => (b64 ? URL.createObjectURL(new Blob([bytesFromBase64(b64) as BlobPart], { type: mimeFor(path) })) : null))
      .catch(() => null);
    cache.set(path, hit);
  }
  return hit;
}

/** A displayable URL for an image in the project, or null while loading / if missing. */
export function useAsset(path: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const project = useStore((s) => s.project?.fs);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) void urlFor(path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path, project]);
  return url;
}

export const ACCEPT_IMAGES = Object.keys(IMAGE_TYPES)
  .map((e) => `.${e}`)
  .join(',');

/** Browser storage holds about 5 MB in total, so large images need a real folder. */
const BROWSER_LIMIT = 2.5 * 1024 * 1024;

export interface SavedImage {
  path: string;
  width: number;
  height: number;
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1600, height: img.naturalHeight || 1000 });
    img.onerror = () => reject(new Error('That file is not an image Inkwell can read. Try PNG, JPEG, WebP or SVG.'));
    img.src = url;
  });
}

/** Copy an image file into the project's assets folder. */
export async function saveImage(file: File): Promise<SavedImage> {
  const fs = store.get().project?.fs;
  if (!fs) throw new Error('Open a project first.');
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!IMAGE_TYPES[ext]) throw new Error('Inkwell can use PNG, JPEG, GIF, WebP, AVIF and SVG images.');
  if (fs instanceof LocalFs && file.size > BROWSER_LIMIT) {
    throw new Error(`This image is ${(file.size / 1024 / 1024).toFixed(1)} MB, too large for a project kept in the browser. Save the project to a folder first (Settings), then add it.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFor(file.name) }));
  try {
    const { width, height } = await imageSize(blobUrl);
    const base = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
    const path = `${ASSETS_DIR}/${base}-${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}.${ext === 'jpeg' ? 'jpg' : ext}`;
    try {
      await fs.writeBinary(path, base64FromBytes(bytes));
    } catch (e) {
      throw new Error(`Couldn’t save the image: ${(e as Error).message}`);
    }
    cache.set(path, Promise.resolve(blobUrl));
    return { path, width, height };
  } catch (e) {
    URL.revokeObjectURL(blobUrl);
    throw e;
  }
}

/** Open the system file picker for one or more images. */
export function pickImages(multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_IMAGES;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export function imageFilesFrom(dt: DataTransfer | null): File[] {
  return Array.from(dt?.files ?? []).filter((f) => IMAGE_TYPES[(f.name.split('.').pop() ?? '').toLowerCase()]);
}
