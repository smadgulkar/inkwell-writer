import { useEffect, useState } from 'react';
import { store, useStore, type TrashItem } from '../store/store';
import { IconRestore, IconX } from './icons';

export function openTrash() {
  store.setTrash(true);
}

const KIND: Record<string, string> = { scene: 'Scene', chapter: 'Chapter', part: 'Part', character: 'Character', world: 'World entry', subplot: 'Subplot', map: 'Map', event: 'Event', submission: 'Submission', market: 'Market', idea: 'Idea' };

export function TrashDialog() {
  const rev = useStore((s) => s.historyRev);
  const [items, setItems] = useState<TrashItem[] | null>(null);
  useEffect(() => {
    let live = true;
    void store.listTrash().then((x) => live && setItems(x));
    return () => {
      live = false;
    };
  }, [rev]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && store.setTrash(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <>
      <div className="scrim" onClick={() => store.setTrash(false)} />
      <div className="dialog trash" role="dialog" aria-label="Trash">
        <header className="compare-head" style={{ padding: 0, border: 0, marginBottom: 12 }}>
          <div>
            <h2>Trash</h2>
            <p className="muted" style={{ margin: 0 }}>
              Deleted items wait in the project’s .inkwell/trash folder until you restore them.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={() => store.setTrash(false)}>
            <IconX />
          </button>
        </header>
        {items === null ? null : items.length === 0 ? (
          <p className="muted" style={{ margin: '12px 0 0' }}>
            The trash is empty.
          </p>
        ) : (
          <ul className="trash-list">
            {items.map((it) => (
              <li key={it.file}>
                <span className="trash-title">{it.title || 'Untitled'}</span>
                <span className="muted">{KIND[it.kind] ?? it.kind}</span>
                <button className="btn" onClick={() => void store.restoreFromTrash(it)}>
                  <IconRestore width={14} height={14} /> Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
