import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeSubplots,
  beatsOf,
  sceneGroups,
  subplotColorOf,
  subplotStatusOf,
  warningText,
  GAP_WARNING_CHAPTERS,
} from '../../model/subplots';
import type { Doc } from '../../model/types';
import { store, useStore } from '../../store/store';
import { IconAlert, IconPlus, IconTrash } from '../icons';
import { SubplotSwatch } from './shared';

interface CellRef {
  sceneId: string;
  subplotId: string;
  x: number;
  y: number;
}

function BeatPopover({ cell, onClose }: { cell: CellRef; onClose(): void }) {
  const docs = useStore((s) => s.project!.docs);
  const scene = docs[cell.sceneId];
  const sp = docs[cell.subplotId];
  const [note, setNote] = useState(scene ? beatsOf(scene)[cell.subplotId] ?? '' : '');
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  if (!scene || !sp) return null;
  const save = () => store.setBeat(cell.sceneId, cell.subplotId, note);
  return (
    <div
      ref={ref}
      className="beat-pop"
      role="dialog"
      aria-label={`${sp.title} in ${scene.title}`}
      style={{ left: Math.min(cell.x, window.innerWidth - 320), top: Math.min(cell.y + 8, window.innerHeight - 220) }}
    >
      <div className="beat-pop-head">
        <SubplotSwatch color={subplotColorOf(sp)} />
        <strong>{sp.title}</strong>
        <span className="muted">in {scene.title || 'Untitled scene'}</span>
      </div>
      <textarea
        ref={input}
        className="input"
        rows={3}
        value={note}
        placeholder="What happens to this thread here?"
        aria-label="Beat note"
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
            onClose();
          }
          if (e.key === 'Escape') onClose();
        }}
      />
      <div className="beat-pop-actions">
        <button
          className="btn ghost danger"
          onClick={() => {
            store.setSceneSubplot(cell.sceneId, cell.subplotId, false);
            onClose();
          }}
        >
          <IconTrash width={14} height={14} /> Remove from scene
        </button>
        <button
          className="btn primary"
          onClick={() => {
            save();
            onClose();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function PlotGrid() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const [cell, setCell] = useState<CellRef | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const groups = useMemo(() => sceneGroups(binder, docs).filter((g) => g.scenes.length), [binder, docs]);
  const analysis = useMemo(() => analyzeSubplots(binder, docs), [binder, docs]);
  const subplots = Object.values(docs)
    .filter((d) => d.kind === 'subplot')
    .sort((a, b) => {
      const sa = analysis.get(a.id)?.scenes.length ? 0 : 1;
      const sb = analysis.get(b.id)?.scenes.length ? 0 : 1;
      return sa - sb || a.title.localeCompare(b.title);
    });
  const columns = groups.flatMap((g, gi) => g.scenes.map((sid, i) => ({ sid, gi, first: i === 0 })));

  if (!subplots.length) {
    return (
      <div className="empty-state">
        <p>Track each thread of your story across scenes: who is chasing what, which mystery is still open, which romance went quiet for eight chapters.</p>
        <button className="btn primary" onClick={() => store.addSubplot()}>
          Add your first subplot
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid-legend muted">
        Click a cell to put a subplot in a scene; click a filled cell to note what happens. Threads missing for {GAP_WARNING_CHAPTERS} or more chapters are flagged.
      </div>
      <div className="plotgrid-wrap">
        <table className="plotgrid">
          <thead>
            <tr className="pg-chapters">
              <th className="pg-corner" rowSpan={2}>
                <button className="add-link" onClick={() => store.addSubplot()}>
                  <IconPlus /> Subplot
                </button>
              </th>
              {groups.map((g, gi) => (
                <th key={gi} colSpan={g.scenes.length} className="pg-chapter" scope="colgroup">
                  {g.id ? (
                    <button onClick={() => store.select(g.id!)} title={g.title}>
                      {g.title}
                    </button>
                  ) : (
                    <span>{g.title}</span>
                  )}
                </th>
              ))}
            </tr>
            <tr className="pg-scenes">
              {columns.map(({ sid, first }) => (
                <th key={sid} className={`pg-scene ${first ? 'ch-start' : ''} ${hoverCol === sid ? 'hover' : ''}`} scope="col">
                  <button title={docs[sid]?.title} onClick={() => store.select(sid)}>
                    <span>{docs[sid]?.title || 'Untitled'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subplots.map((sp) => {
              const a = analysis.get(sp.id)!;
              const color = subplotColorOf(sp);
              const present = new Set(a.scenes);
              const firstIdx = columns.findIndex((c) => present.has(c.sid));
              let lastIdx = -1;
              columns.forEach((c, i) => present.has(c.sid) && (lastIdx = i));
              const status = subplotStatusOf(sp);
              const warnings = a.warnings.filter((w) => w.kind !== 'unresolved');
              return (
                <tr key={sp.id} style={{ ['--c' as string]: `var(--sp-${color})` }}>
                  <th scope="row" className="pg-row-head">
                    <div className="pg-row-inner">
                    <button className="pg-sp" onClick={() => store.select(sp.id)}>
                      <SubplotSwatch color={color} size={11} />
                      <span className="pg-sp-title">{sp.title || 'Untitled subplot'}</span>
                      <span className={`pg-status ${status}`}>{status}</span>
                    </button>
                    {warnings.length > 0 && (
                      <span className="pg-warn" title={warnings.map(warningText).join('\n')} aria-label={warnings.map(warningText).join('. ')}>
                        <IconAlert />
                      </span>
                    )}
                    </div>
                  </th>
                  {columns.map(({ sid, first }, i) => {
                    const on = present.has(sid);
                    const scene = docs[sid] as Doc;
                    const note = on ? beatsOf(scene)[sp.id] : undefined;
                    const inThread = firstIdx >= 0 && i > firstIdx && i <= lastIdx;
                    return (
                      <td
                        key={sid}
                        className={`pg-cell ${first ? 'ch-start' : ''} ${hoverCol === sid ? 'hover' : ''} ${inThread ? 'thread' : ''}`}
                        onMouseEnter={() => setHoverCol(sid)}
                        onMouseLeave={() => setHoverCol(null)}
                      >
                        <button
                          className={`pg-dot ${on ? 'on' : ''} ${note ? 'noted' : ''}`}
                          aria-pressed={on}
                          aria-label={`${sp.title} in ${scene.title}${note ? `: ${note}` : ''}`}
                          title={note || (on ? 'Click to add a note' : `Add ${sp.title} to this scene`)}
                          onClick={(e) => {
                            if (!on) {
                              store.setSceneSubplot(sid, sp.id, true);
                              return;
                            }
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setCell({ sceneId: sid, subplotId: sp.id, x: r.left - 20, y: r.bottom });
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cell && <BeatPopover cell={cell} onClose={() => setCell(null)} />}
      <SubplotSummary subplots={subplots} analysis={analysis} />
    </>
  );
}

function SubplotSummary({ subplots, analysis }: { subplots: Doc[]; analysis: ReturnType<typeof analyzeSubplots> }) {
  const flagged = subplots.filter((sp) => (analysis.get(sp.id)?.warnings ?? []).some((w) => w.kind === 'gap' || w.kind === 'unused'));
  if (!flagged.length) return null;
  return (
    <section className="grid-flags">
      <h2 className="section-label">Needs attention</h2>
      <ul>
        {flagged.map((sp) => (
          <li key={sp.id}>
            <SubplotSwatch color={subplotColorOf(sp)} />
            <button className="link-btn" onClick={() => store.select(sp.id)}>
              {sp.title}
            </button>
            <span className="muted">
              {analysis
                .get(sp.id)!
                .warnings.filter((w) => w.kind !== 'unresolved')
                .map(warningText)
                .join('; ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

