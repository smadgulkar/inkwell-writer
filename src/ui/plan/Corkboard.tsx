import { useState } from 'react';
import { canDrop, type DropPosition } from '../../model/binder';
import { sceneGroups, type SceneGroup } from '../../model/subplots';
import type { Status } from '../../model/types';
import { formatCount } from '../../model/words';
import { store, useStore } from '../../store/store';
import { IconArrow, IconPlus } from '../icons';
import { AutoTextarea } from '../Page';
import { Avatar } from '../pickers';
import { SubplotStripes } from './shared';

interface Drag {
  id: string;
  over: string | null; // scene id, or `col:<groupKey>`
  pos: DropPosition | null;
}

const groupKey = (g: SceneGroup) => g.id ?? '__root';

export function Corkboard() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const counts = useStore((s) => s.counts);
  const [drag, setDrag] = useState<Drag | null>(null);
  const groups = sceneGroups(binder, docs);

  const overCard = (e: React.DragEvent, sceneId: string) => {
    if (!drag || drag.id === sceneId) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: DropPosition = e.clientY - r.top < r.height / 2 ? 'before' : 'after';
    if (!canDrop(binder, drag.id, sceneId, pos)) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.over !== sceneId || drag.pos !== pos) setDrag({ ...drag, over: sceneId, pos });
  };
  const overColumn = (e: React.DragEvent, g: SceneGroup) => {
    if (!drag) return;
    if (!canDrop(binder, drag.id, g.id, 'inside')) return;
    e.preventDefault();
    const key = `col:${groupKey(g)}`;
    if (drag.over !== key) setDrag({ ...drag, over: key, pos: 'inside' });
  };
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag?.over && drag.pos) {
      if (drag.over.startsWith('col:')) {
        const key = drag.over.slice(4);
        store.move(drag.id, key === '__root' ? null : key, 'inside');
      } else store.move(drag.id, drag.over, drag.pos);
    }
    setDrag(null);
  };

  if (!groups.length) {
    return (
      <div className="empty-state">
        <p>Your scenes will appear here as index cards, one column per chapter, ready to rearrange.</p>
        <button className="btn primary" onClick={() => store.addNode('scene')}>
          Add a scene
        </button>
      </div>
    );
  }

  return (
    <div className="cork" onDragEnd={() => setDrag(null)}>
      {groups.map((g) => {
        const words = g.scenes.reduce((a, s) => a + (counts[s] ?? 0), 0);
        const colOver = drag?.over === `col:${groupKey(g)}`;
        return (
          <section key={groupKey(g)} className={`cork-col ${colOver ? 'drop-col' : ''}`} onDragOver={(e) => overColumn(e, g)} onDrop={drop} aria-label={g.title}>
            <header className="cork-head">
              {g.id ? (
                <button className="cork-title" onClick={() => store.select(g.id!)} title="Open chapter">
                  {g.title}
                </button>
              ) : (
                <span className="cork-title">{g.title}</span>
              )}
              <span className="muted">
                {g.scenes.length} {g.scenes.length === 1 ? "scene" : "scenes"}, {formatCount(words)} words
              </span>
            </header>
            <div className="cork-cards">
              {g.scenes.map((sid, i) => {
                const d = docs[sid];
                if (!d) return null;
                const status = (d.fields.status as Status) ?? 'draft';
                const pov = typeof d.fields.pov === 'string' ? docs[d.fields.pov] : undefined;
                const target = Number(d.fields.target) || 0;
                const w = counts[sid] ?? 0;
                const dropCls = drag?.over === sid && drag.pos ? `drop-${drag.pos}` : '';
                return (
                  <article
                    key={sid}
                    className={`index-card ${drag?.id === sid ? 'dragging' : ''} ${dropCls}`}
                    onDragOver={(e) => overCard(e, sid)}
                    onDrop={drop}
                    style={{ ['--tilt' as string]: `${((sid.charCodeAt(4) % 5) - 2) * 0.18}deg` }}
                  >
                    <div
                      className="ic-head"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', d.title);
                        setDrag({ id: sid, over: null, pos: null });
                      }}
                      onDoubleClick={() => store.select(sid)}
                      title="Drag to move. Double-click to open."
                    >
                      <span className={`status-dot ${status}`} title={status} />
                      <span className="ic-num">{i + 1}</span>
                      <span className="ic-title">{d.title || 'Untitled scene'}</span>
                      <button className="icon-btn ic-open" aria-label={`Open ${d.title || 'scene'}`} title="Open scene" onClick={() => store.select(sid)}>
                        <IconArrow />
                      </button>
                    </div>
                    <AutoTextarea
                      className="ic-syn"
                      value={String(d.fields.synopsis ?? '')}
                      placeholder="What happens here?"
                      aria-label={`Synopsis of ${d.title}`}
                      onChange={(e) => store.updateDoc(sid, { fields: { synopsis: e.target.value.replace(/\n/g, ' ') } })}
                    />
                    <footer className="ic-foot">
                      {pov ? <Avatar id={pov.id} name={pov.title} size={18} /> : null}
                      <SubplotStripes scene={d} />
                      <span className="grow" />
                      <span className="ic-words">
                        {formatCount(w)}
                        {target ? ` / ${formatCount(target)}` : ''}
                      </span>
                    </footer>
                    {target > 0 && (
                      <span className="ic-rule" aria-hidden="true">
                        <i style={{ width: `${Math.min(100, (w / target) * 100)}%`, background: `var(--st-${status})` }} />
                      </span>
                    )}
                  </article>
                );
              })}
              {g.id && !g.loose && (
                <button className="cork-add" onClick={() => store.addNode('scene', { targetId: g.id, pos: 'inside', select: false })}>
                  <IconPlus /> Add scene
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
