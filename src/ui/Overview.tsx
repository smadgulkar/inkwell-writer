import { useEffect, useMemo, useState } from 'react';
import { hueOf, initials, profileOf, relationshipsOf, roleOf, ROLE_LABEL, worldKindOf, WORLD_TEMPLATES } from '../model/entities';
import { ROLES, WORLD_KINDS, type Doc } from '../model/types';
import { store, useStore } from '../store/store';
import { IconAddCharacter, IconPlus, WORLD_ICON } from './icons';
import { Avatar } from './pickers';
import { NewWorldMenu } from './EntitySidebar';

function useAppearanceCounts() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, list] of store.mentionIndex().byEntity) out[id] = list.length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, binder]);
}

const plural = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');

const firstFilled = (d: Doc) => profileOf(d).find(([, v]) => v.trim());

// ---------- characters ----------

export function CharactersOverview() {
  const docs = useStore((s) => s.project!.docs);
  const counts = useAppearanceCounts();
  const chars = Object.values(docs)
    .filter((d) => d.kind === 'character')
    .sort((a, b) => ROLES.indexOf(roleOf(a)) - ROLES.indexOf(roleOf(b)) || a.title.localeCompare(b.title));

  return (
    <article className="page wide">
      <header className="overview-head">
        <h1 className="title-input" style={{ fontStyle: 'normal' }}>
          Characters
        </h1>
        <button className="btn primary" onClick={() => store.addCharacter()}>
          <IconAddCharacter /> New character
        </button>
      </header>
      {chars.length === 0 ? (
        <EmptyState text="Everyone in your story gets a page here: profile, arc, relationships and every scene they appear in." action="Add your first character" onAction={() => store.addCharacter()} />
      ) : (
        <>
          <div className="cards">
            {chars.map((c) => {
              const f = firstFilled(c);
              return (
                <button key={c.id} className="card char-card" onClick={() => store.select(c.id)}>
                  <span className="card-title">
                    <Avatar id={c.id} name={c.title} size={34} />
                    <span>
                      {c.title || 'Unnamed'}
                      <span className="card-role">{ROLE_LABEL[roleOf(c)]}</span>
                    </span>
                  </span>
                  <span className="card-syn">{f ? `${f[0]}: ${f[1]}` : <em style={{ opacity: 0.7 }}>No profile details yet</em>}</span>
                  <span className="card-meta">
                    <span>{plural(relationshipsOf(c).length, 'relationship')}</span>
                    <span>{counts[c.id] ? plural(counts[c.id], 'scene') : 'Not in a scene yet'}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <RelationshipGraph chars={chars} />
        </>
      )}
    </article>
  );
}

interface GNode {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
}
interface GLink {
  source: string;
  target: string;
  label: string;
}

function RelationshipGraph({ chars }: { chars: Doc[] }) {
  const counts = useAppearanceCounts();
  const links: GLink[] = useMemo(() => {
    const ids = new Set(chars.map((c) => c.id));
    const seen = new Set<string>();
    const out: GLink[] = [];
    for (const c of chars)
      for (const r of relationshipsOf(c)) {
        if (!ids.has(r.to) || r.to === c.id) continue;
        const key = [c.id, r.to].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ source: c.id, target: r.to, label: r.kind ?? '' });
      }
    return out;
  }, [chars]);
  const [layout, setLayout] = useState<GNode[] | null>(null);
  const W = 760;
  const H = 420;

  useEffect(() => {
    let cancelled = false;
    // d3-force loads only when the graph is shown.
    import('d3-force').then((d3) => {
      if (cancelled) return;
      const nodes = chars.map((c, i) => ({
        id: c.id,
        name: c.title || 'Unnamed',
        r: 16 + Math.min(14, Math.sqrt(counts[c.id] ?? 0) * 4),
        x: W / 2 + Math.cos((i / chars.length) * Math.PI * 2) * 150,
        y: H / 2 + Math.sin((i / chars.length) * Math.PI * 2) * 120,
      }));
      const sim = d3
        .forceSimulation(nodes as (GNode & { index?: number })[])
        .force('link', d3.forceLink(links.map((l) => ({ ...l }))).id((d) => (d as GNode).id).distance(170))
        .force('charge', d3.forceManyBody().strength(-500))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collide', d3.forceCollide().radius((d) => (d as GNode).r + 34))
        .stop();
      for (let i = 0; i < 300; i++) sim.tick();
      // Scale the settled layout to fill the frame, leaving room for names under the circles.
      const xs = nodes.map((n) => n.x);
      const ys = nodes.map((n) => n.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const padX = 90;
      const padTop = 50;
      const padBottom = 60;
      const sx = x1 > x0 ? (W - 2 * padX) / (x1 - x0) : 1;
      const sy = y1 > y0 ? (H - padTop - padBottom) / (y1 - y0) : 1;
      const k = Math.min(sx, sy, 2.2);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      for (const n of nodes) {
        n.x = W / 2 + (n.x - cx) * k;
        n.y = padTop + (H - padTop - padBottom) / 2 + (n.y - cy) * k;
      }
      setLayout(nodes);
    });
    return () => {
      cancelled = true;
    };
  }, [chars, links, counts]);

  if (!links.length) {
    return (
      <section className="graph-section">
        <h2 className="section-label">Relationships</h2>
        <p className="muted">Add relationships on a character’s page and they will appear here as a map.</p>
      </section>
    );
  }
  const pos = new Map(layout?.map((n) => [n.id, n]));
  return (
    <section className="graph-section">
      <h2 className="section-label">Relationships</h2>
      <div className="graph-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Relationship map">
          {layout &&
            links.map((l, i) => {
              const a = pos.get(l.source)!;
              const b = pos.get(l.target)!;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={i}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line-strong)" strokeWidth="1.25" />
                  {l.label && (
                    <g transform={`translate(${mx} ${my})`}>
                      <rect x={-l.label.length * 3.4 - 7} y={-10} width={l.label.length * 6.8 + 14} height={20} rx={10} fill="var(--surface)" stroke="var(--line)" />
                      <text textAnchor="middle" y={4} fontSize="11.5" fill="var(--muted)">
                        {l.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          {layout?.map((n) => (
            <g key={n.id} className="graph-node" transform={`translate(${n.x} ${n.y})`} onClick={() => store.select(n.id)} tabIndex={0} role="button" aria-label={n.name} onKeyDown={(e) => e.key === 'Enter' && store.select(n.id)}>
              <circle r={n.r} fill={`oklch(0.86 0.06 ${hueOf(n.id)})`} stroke={`oklch(0.55 0.1 ${hueOf(n.id)})`} strokeWidth="1.25" />
              <text textAnchor="middle" y={n.r * 0.14} fontSize={n.r * 0.62} fontFamily="var(--font-prose)" fontWeight="600" fill={`oklch(0.32 0.08 ${hueOf(n.id)})`}>
                {initials(n.name)}
              </text>
              <text textAnchor="middle" y={n.r + 16} fontSize="12.5" fontWeight="500" fill="var(--text)">
                {n.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

// ---------- world ----------

export function WorldOverview() {
  const docs = useStore((s) => s.project!.docs);
  const counts = useAppearanceCounts();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const entries = Object.values(docs).filter((d) => d.kind === 'world');

  return (
    <article className="page wide">
      <header className="overview-head">
        <h1 className="title-input" style={{ fontStyle: 'normal' }}>
          World
        </h1>
        <button className="btn primary" onClick={(e) => setMenu({ x: e.clientX - 160, y: e.clientY + 18 })}>
          <IconPlus /> New entry
        </button>
      </header>
      {entries.length === 0 ? (
        <EmptyState
          text="Places, cultures, religions, magic systems, history and everything else that makes your world what it is."
          action="Add your first place"
          onAction={() => store.addWorld('place')}
        />
      ) : (
        WORLD_KINDS.map((k) => {
          const group = entries.filter((e) => worldKindOf(e) === k).sort((a, b) => a.title.localeCompare(b.title));
          if (!group.length) return null;
          const Icon = WORLD_ICON[k];
          return (
            <section key={k}>
              <h2 className="section-label">
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon width={14} height={14} /> {WORLD_TEMPLATES[k].plural}
                </span>
              </h2>
              <div className="cards">
                {group.map((d) => {
                  const f = firstFilled(d);
                  const syn = f ? `${f[0]}: ${f[1]}` : d.body.split('\n')[0];
                  return (
                    <button key={d.id} className="card" onClick={() => store.select(d.id)}>
                      <span className="card-title">{d.title || 'Untitled'}</span>
                      <span className="card-syn">{syn || <em style={{ opacity: 0.7 }}>Nothing written yet</em>}</span>
                      <span className="card-meta">
                        <span>{d.fields.parent && docs[d.fields.parent as string] ? `in ${docs[d.fields.parent as string].title}` : ''}</span>
                        <span>{plural(counts[d.id] ?? 0, 'scene')}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
      {menu && <NewWorldMenu anchor={menu} onClose={() => setMenu(null)} />}
    </article>
  );
}

function EmptyState({ text, action, onAction }: { text: string; action: string; onAction(): void }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      <button className="btn primary" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
