import { useEffect, useMemo, useState } from 'react';
import { diffStats, diffText } from '../model/diff';
import { markdownToText } from '../model/markdown';
import { countMarkdown } from '../model/words';
import { store, useStore } from '../store/store';
import { IconWarn, IconX } from './icons';

/** Side-by-side resolution for documents a sync service left in two versions. */
export function ConflictsDialog() {
  const conflicts = useStore((s) => s.conflicts);
  const docs = useStore((s) => s.project!.docs);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const c = conflicts[Math.min(index, conflicts.length - 1)];
  const mine = c ? docs[c.id] : undefined;
  const ops = useMemo(() => (c ? diffText(markdownToText(mine?.body ?? ''), markdownToText(c.doc.body)) : []), [c, mine?.body]);
  const stats = diffStats(ops);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && store.setConflictsOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  if (!c) return null;
  const titleDiffers = mine && mine.title !== c.doc.title;
  const resolve = async (choice: 'mine' | 'theirs' | 'both') => {
    setBusy(true);
    try {
      await store.resolveConflict(c, choice);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="scrim" onClick={() => store.setConflictsOpen(false)} />
      <div className={`compare conflicts ${conflicts.length > 1 ? 'with-list' : ''}`} role="dialog" aria-label="Sync conflicts">
        {conflicts.length > 1 && (
          <nav className="cf-list" aria-label="Documents with two versions">
            <h3>{conflicts.length} to sort out</h3>
            {conflicts.map((x, i) => (
              <button key={(x.path ?? 'mem') + x.id} aria-pressed={x === c} onClick={() => setIndex(i)}>
                <span>{docs[x.id]?.title || x.doc.title || 'Untitled'}</span>
                <small>{x.label}</small>
              </button>
            ))}
          </nav>
        )}
        <div className="cf-main">
          <header className="compare-head">
            <div>
              <h2>
                <IconWarn width={17} height={17} className="cf-icon" /> Two versions of “{mine?.title || c.doc.title || 'Untitled'}”
              </h2>
              <p className="muted">
                {c.label}
                {c.path ? <> in <code>{c.path}</code></> : null}. Yours has {countMarkdown(mine?.body ?? '').toLocaleString()} words, the other {countMarkdown(c.doc.body).toLocaleString()}.
                {titleDiffers && <> The other is titled “{c.doc.title}”.</>}
              </p>
              <p className="cf-legend">
                <span>
                  <del>struck through</del> only in yours
                </span>
                <span>
                  <ins>highlighted</ins> only in the other
                </span>
                {!(stats.added || stats.removed) && <span>The text is the same; only details such as tags or status differ.</span>}
              </p>
            </div>
            <button className="icon-btn" aria-label="Close" onClick={() => store.setConflictsOpen(false)}>
              <IconX />
            </button>
          </header>
          <div className="compare-body">
            {ops.map((p, i) => (
              <p key={i} className={p.length === 1 && p[0].t !== 'same' ? `whole-${p[0].t}` : ''}>
                {p.map((o, j) => (o.t === 'same' ? <span key={j}>{o.s}</span> : o.t === 'add' ? <ins key={j}>{o.s}</ins> : <del key={j}>{o.s}</del>))}
              </p>
            ))}
            {!ops.length && <p className="muted">Both versions are empty.</p>}
          </div>
          <footer className="compare-foot">
            <span className="muted cf-note">Whichever you don’t keep is saved in the document’s snapshots.</span>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" disabled={busy} onClick={() => resolve('both')}>
              Keep both
            </button>
            <button className="btn" disabled={busy} onClick={() => resolve('theirs')}>
              Use the other version
            </button>
            <button className="btn primary" disabled={busy} onClick={() => resolve('mine')}>
              Keep mine
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}
