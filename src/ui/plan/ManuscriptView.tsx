import { useEffect, useRef, useState } from 'react';
import { sceneGroups } from '../../model/subplots';
import type { Doc } from '../../model/types';
import { formatCount } from '../../model/words';
import { store, useStore } from '../../store/store';
import { IconArrow } from '../icons';
import { useEntityLinking } from '../linking';
import { ProseEditor } from '../ProseEditor';

/** Mounts its editor only once it comes near the viewport, so long books open instantly. */
function LazyScene({ doc, words }: { doc: Doc; words: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const rev = useStore((s) => s.externalRev);
  const linking = useEntityLinking();
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      // Observe against the scrolling page, not the window, so the margin pre-loads nearby scenes.
      { root: el.closest('.page-scroll'), rootMargin: '1200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  // Roughly 11 words per line at the default measure, 1.72 line height.
  const estimate = Math.max(80, Math.ceil(words / 11) * 32);
  return (
    <div ref={ref} className="ms-scene">
      {visible ? (
        <ProseEditor
          docId={doc.id}
          markdown={doc.body}
          rev={rev}
          onChange={(md, id) => store.updateDoc(id, { body: md })}
          onSelectionWords={(n) => store.setSelectionWords(n)}
          placeholder="This scene is empty."
          {...linking}
        />
      ) : (
        <div className="ms-placeholder" style={{ height: estimate }} aria-hidden="true" />
      )}
    </div>
  );
}

export function ManuscriptView() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const counts = useStore((s) => s.counts);
  const groups = sceneGroups(binder, docs).filter((g) => g.scenes.length);
  const [scope, setScope] = useState<string>('all');
  const shown = scope === 'all' ? groups : groups.filter((g) => (g.id ?? '__root') === scope);
  const total = shown.reduce((a, g) => a + g.scenes.reduce((b, s) => b + (counts[s] ?? 0), 0), 0);

  return (
    <div className="manuscript">
      <div className="ms-bar">
        <label className="field">
          <span className="muted">Show</span>
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Chapter to show">
            <option value="all">Whole manuscript</option>
            {groups.map((g) => (
              <option key={g.id ?? '__root'} value={g.id ?? '__root'}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">{total.toLocaleString()} words</span>
      </div>
      <div className="ms-page">
        {shown.map((g) => (
          <section key={g.id ?? '__root'} className="ms-chapter">
            <h2 className="ms-chapter-title">{g.title}</h2>
            {g.scenes.map((sid, i) => {
              const d = docs[sid];
              if (!d) return null;
              return (
                <div key={sid}>
                  <div className={`ms-divider ${i === 0 ? 'first' : ''}`}>
                    <button className="ms-label" onClick={() => store.select(sid)} title="Open this scene on its own">
                      {d.title || 'Untitled scene'}
                      <IconArrow />
                    </button>
                    <span className="muted">{formatCount(counts[sid] ?? 0)}</span>
                  </div>
                  <LazyScene doc={d} words={counts[sid] ?? 0} />
                </div>
              );
            })}
          </section>
        ))}
        {!shown.length && <p className="muted">No scenes to show yet.</p>}
      </div>
    </div>
  );
}
