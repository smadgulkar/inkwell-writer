import { useEffect, useMemo, useState } from 'react';
import { diffStats, diffText } from '../model/diff';
import { markdownToText } from '../model/markdown';
import type { Doc } from '../model/types';
import { store, useStore, type SnapshotInfo } from '../store/store';
import { IconSnapshots, IconPlus, IconTrash, IconX } from './icons';

function when(d: Date) {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + `, ${time}`;
}

export function useSnapshots(id: string) {
  const rev = useStore((s) => s.historyRev);
  const [snaps, setSnaps] = useState<SnapshotInfo[] | null>(null);
  useEffect(() => {
    let live = true;
    void store.listSnapshots(id).then((s) => live && setSnaps(s));
    return () => {
      live = false;
    };
  }, [id, rev]);
  return snaps;
}

export function SnapshotSection({ doc }: { doc: Doc }) {
  const snaps = useSnapshots(doc.id);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<SnapshotInfo | null>(null);
  return (
    <section className="insp-section">
      <div className="insp-label">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconSnapshots width={13} height={13} /> Snapshots
        </span>
        <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Take a snapshot" title="Take a snapshot (Ctrl+Alt+S)" onClick={() => setNaming(true)}>
          <IconPlus />
        </button>
      </div>
      {naming && (
        <form
          className="snap-form"
          onSubmit={(e) => {
            e.preventDefault();
            void store.takeSnapshot(doc.id, { name: name.trim() || undefined });
            setName('');
            setNaming(false);
          }}
        >
          <input className="input" autoFocus value={name} placeholder="Name (optional), e.g. Before cutting the flashback" aria-label="Snapshot name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNaming(false)} />
          <button className="btn primary" type="submit">
            Save
          </button>
        </form>
      )}
      {snaps && snaps.length === 0 && !naming && <p className="muted insp-note">A copy is kept automatically the first time you edit this scene each day. Take one yourself before big changes.</p>}
      {snaps && snaps.length > 0 && (
        <ul className="snap-list">
          {snaps.slice(0, 12).map((s) => (
            <li key={s.file}>
              <button onClick={() => setOpen(s)}>
                <span className="snap-name">{s.name || s.reason || 'Snapshot'}</span>
                <span className="snap-meta">
                  {when(s.taken)} · {s.words.toLocaleString()} words
                </span>
              </button>
            </li>
          ))}
          {snaps.length > 12 && <li className="muted insp-note">and {snaps.length - 12} older</li>}
        </ul>
      )}
      {open && <CompareDialog doc={doc} snap={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function CompareDialog({ doc, snap, onClose }: { doc: Doc; snap: SnapshotInfo; onClose(): void }) {
  const current = useStore((s) => s.project?.docs[doc.id]?.body ?? '');
  const ops = useMemo(() => diffText(markdownToText(snap.body), markdownToText(current)), [snap.body, current]);
  const stats = diffStats(ops);
  const same = stats.added === 0 && stats.removed === 0;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="compare" role="dialog" aria-label="Compare with snapshot">
        <header className="compare-head">
          <div>
            <h2>{snap.name || snap.reason || 'Snapshot'}</h2>
            <p className="muted">
              {when(snap.taken)} compared with now.{' '}
              {same ? (
                'No differences.'
              ) : (
                <>
                  <span className="ins-count">+{stats.added}</span> <span className="del-count">−{stats.removed}</span> words
                </>
              )}
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </header>
        <div className="compare-body prose-like">
          {ops.map((p, i) => (
            <p key={i} className={p.length === 1 && p[0].t !== 'same' ? `whole-${p[0].t}` : ''}>
              {p.map((o, j) => (o.t === 'same' ? <span key={j}>{o.s}</span> : o.t === 'add' ? <ins key={j}>{o.s}</ins> : <del key={j}>{o.s}</del>))}
            </p>
          ))}
          {!ops.length && <p className="muted">Both versions are empty.</p>}
        </div>
        <footer className="compare-foot">
          <button
            className="btn ghost danger"
            onClick={() => {
              void store.deleteSnapshot(doc.id, snap);
              onClose();
            }}
          >
            <IconTrash width={14} height={14} /> Delete snapshot
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn primary"
            disabled={same}
            onClick={() => {
              void store.restoreSnapshot(doc.id, snap);
              onClose();
            }}
          >
            Restore this version
          </button>
        </footer>
      </div>
    </>
  );
}
