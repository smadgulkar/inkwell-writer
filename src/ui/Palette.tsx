import { useEffect, useMemo, useRef, useState } from 'react';
import { flatIds, parentOf } from '../model/binder';
import { store, useStore } from '../store/store';
import { commands } from './commands';
import { IconIdea, IconMarket, IconTimeline, IconChapter, IconCharacter, IconMap, IconPart, IconScene, IconSubplot, WORLD_ICON } from './icons';
import { worldKindOf, WORLD_TEMPLATES, ROLE_LABEL, roleOf } from '../model/entities';

interface Item {
  key: string;
  group: 'Go to' | 'Commands';
  title: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run(): void;
  score: number;
  hits: number[];
}

/** Subsequence match with a bonus for word starts and runs. Returns null when it doesn't match. */
export function fuzzy(query: string, text: string): { score: number; hits: number[] } | null {
  if (!query) return { score: 0, hits: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const hits: number[] = [];
  let score = 0;
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    if (c === ' ') continue;
    const found = t.indexOf(c, ti);
    if (found < 0) return null;
    const wordStart = found === 0 || /[\s\-_:(]/.test(t[found - 1]);
    score += 1 + (wordStart ? 3 : 0) + (hits.length && hits[hits.length - 1] === found - 1 ? 2 : 0);
    hits.push(found);
    ti = found + 1;
  }
  score -= t.length * 0.02;
  return { score, hits };
}

function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  return (
    <>
      {[...text].map((ch, i) => (set.has(i) ? <mark key={i}>{ch}</mark> : <span key={i}>{ch}</span>))}
    </>
  );
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = { part: IconPart, chapter: IconChapter, scene: IconScene };

export function Palette() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const project = useStore((s) => s.project);

  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo(() => {
    const out: Item[] = [];
    if (project) {
      for (const id of flatIds(project.meta.binder)) {
        const d = project.docs[id];
        if (!d) continue;
        const title = d.title || 'Untitled';
        const m = fuzzy(q, title);
        if (!m) continue;
        const parent = parentOf(project.meta.binder, id);
        out.push({
          key: id,
          group: 'Go to',
          title,
          hint: parent ? project.docs[parent.id]?.title : undefined,
          icon: KIND_ICON[d.kind],
          run: () => store.select(id),
          ...m,
        });
      }
    }
    if (project) {
      for (const d of Object.values(project.docs)) {
        if (d.kind !== 'character' && d.kind !== 'world' && d.kind !== 'subplot' && d.kind !== 'map' && d.kind !== 'event' && d.kind !== 'market' && d.kind !== 'idea') continue;
        const title = d.title || 'Untitled';
        const m = fuzzy(q, title);
        if (!m || !q) continue;
        out.push({
          key: d.id,
          group: 'Go to',
          title,
          hint: d.kind === 'character' ? ROLE_LABEL[roleOf(d)] : d.kind === 'subplot' ? 'Subplot' : d.kind === 'map' ? 'Map' : d.kind === 'event' ? 'Event' : d.kind === 'market' ? 'Market' : d.kind === 'idea' ? 'Idea' : WORLD_TEMPLATES[worldKindOf(d)].label,
          icon: d.kind === 'character' ? IconCharacter : d.kind === 'subplot' ? IconSubplot : d.kind === 'map' ? IconMap : d.kind === 'event' ? IconTimeline : d.kind === 'market' ? IconMarket : d.kind === 'idea' ? IconIdea : WORLD_ICON[worldKindOf(d)],
          run: () => store.select(d.id),
          ...m,
        });
      }
    }
    for (const c of commands()) {
      const m = fuzzy(q, c.title);
      if (!m) continue;
      out.push({ key: c.id, group: 'Commands', title: c.title, hint: c.keys, icon: c.icon, run: c.run, ...m });
    }
    if (q) out.sort((a, b) => b.score - a.score);
    else out.sort((a, b) => (a.group === b.group ? 0 : a.group === 'Commands' ? -1 : 1));
    return out.slice(0, 60);
  }, [q, project]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    store.setPalette(false);
    item.run();
  };

  let lastGroup = '';
  return (
    <>
      <div className="scrim" onClick={() => store.setPalette(false)} />
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          value={q}
          placeholder="Type a command or a scene name"
          aria-label="Search commands and scenes"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((x) => Math.min(items.length - 1, x + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((x) => Math.max(0, x - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(items[sel]);
            } else if (e.key === 'Escape') {
              store.setPalette(false);
            }
          }}
        />
        <ul id="palette-list" ref={listRef} role="listbox">
          {items.length === 0 && <div className="pl-empty">No matches for “{q}”</div>}
          {items.map((it, i) => {
            const header = !q && it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const Icon = it.icon;
            return (
              <div key={it.key}>
                {header && <div className="pl-group">{header}</div>}
                <li role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => choose(it)}>
                  <Icon />
                  <span className="pl-title">
                    <Highlight text={it.title} hits={it.hits} />
                  </span>
                  {it.hint && <span className="pl-hint">{it.group === 'Commands' ? <kbd>{it.hint}</kbd> : it.hint}</span>}
                </li>
              </div>
            );
          })}
        </ul>
      </div>
    </>
  );
}
