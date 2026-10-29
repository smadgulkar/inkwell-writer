import { useEffect, useState } from 'react';
import type { Doc } from '../model/types';
import { store } from '../store/store';
import { imageFilesFrom, pickImages, saveImage, useAsset } from './assets';
import { IconAddImage, IconChevron, IconChevronLeft, IconTrash, IconX } from './icons';

export const imagesOf = (d: Doc) => (Array.isArray(d.fields.images) ? (d.fields.images as unknown[]).filter((x): x is string => typeof x === 'string') : []);
export const portraitOf = (d: Doc) => (typeof d.fields.portrait === 'string' && d.fields.portrait ? d.fields.portrait : undefined);

async function addImages(doc: Doc, files: File[]) {
  const saved: string[] = [];
  for (const f of files) {
    try {
      saved.push((await saveImage(f)).path);
    } catch (e) {
      store.toast((e as Error).message);
    }
  }
  if (!saved.length) return;
  const current = store.get().project?.docs[doc.id];
  if (!current) return;
  const patch: Record<string, unknown> = { images: [...imagesOf(current), ...saved] };
  // A character's first image becomes their portrait.
  if (current.kind === 'character' && !portraitOf(current)) patch.portrait = saved[0];
  store.updateDoc(doc.id, { fields: patch });
}

export async function choosePortrait(doc: Doc) {
  const f = (await pickImages(false))[0];
  if (!f) return;
  try {
    const { path } = await saveImage(f);
    const current = store.get().project?.docs[doc.id] ?? doc;
    store.updateDoc(doc.id, { fields: { portrait: path, images: imagesOf(current).includes(path) ? imagesOf(current) : [path, ...imagesOf(current)] } });
  } catch (e) {
    store.toast((e as Error).message);
  }
}

function Thumb({ path, onOpen }: { path: string; onOpen(): void }) {
  const url = useAsset(path);
  return (
    <button className="g-thumb" onClick={onOpen} aria-label="Open image">
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="g-loading" />}
    </button>
  );
}

function Lightbox({ doc, index, onClose, onIndex }: { doc: Doc; index: number; onClose(): void; onIndex(i: number): void }) {
  const images = imagesOf(doc);
  const path = images[index];
  const url = useAsset(path);
  const isPortrait = portraitOf(doc) === path;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, images.length, onClose, onIndex]);
  if (!path) return null;
  return (
    <div className="lightbox" role="dialog" aria-label="Image" onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="muted">
          {index + 1} of {images.length}
        </span>
        <span style={{ flex: 1 }} />
        {doc.kind === 'character' && (
          <button className="btn ghost" disabled={isPortrait} onClick={() => store.updateDoc(doc.id, { fields: { portrait: path } })}>
            {isPortrait ? 'Portrait' : 'Use as portrait'}
          </button>
        )}
        <button
          className="btn ghost danger"
          onClick={() => {
            const next = images.filter((p) => p !== path);
            store.updateDoc(doc.id, { fields: { images: next, portrait: isPortrait ? next[0] : portraitOf(doc) } });
            if (!next.length) onClose();
            else onIndex(Math.min(index, next.length - 1));
          }}
        >
          <IconTrash width={14} height={14} /> Remove
        </button>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconX />
        </button>
      </div>
      {images.length > 1 && (
        <>
          <button
            className="lb-nav prev"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + images.length) % images.length);
            }}
          >
            <IconChevronLeft />
          </button>
          <button
            className="lb-nav next"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % images.length);
            }}
          >
            <IconChevron />
          </button>
        </>
      )}
      {url && <img className="lb-img" src={url} alt="" onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

export function Gallery({ doc }: { doc: Doc }) {
  const images = imagesOf(doc);
  const [open, setOpen] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`gallery ${over ? 'drop' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void addImages(doc, imageFilesFrom(e.dataTransfer));
      }}
    >
      {images.map((p, i) => (
        <Thumb key={p} path={p} onOpen={() => setOpen(i)} />
      ))}
      <button className="g-add" onClick={async () => void addImages(doc, await pickImages(true))}>
        <IconAddImage />
        <span>{images.length ? 'Add' : 'Add images, or drop them here'}</span>
      </button>
      {open !== null && <Lightbox doc={doc} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </div>
  );
}
