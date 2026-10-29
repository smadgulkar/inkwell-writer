import { useEffect, useMemo, useRef, useState } from 'react';
import { flatIds } from '../model/binder';
import { profileOf, worldKindOf } from '../model/entities';
import { markdownToText } from '../model/markdown';
import type { Doc } from '../model/types';
import { store, useStore } from '../store/store';
import { IconChapter, IconCharacter, IconPart, IconScene, IconSearch, WORLD_ICON } from './icons';

type Filter = 'all' | 'manuscript' | 'characters' | 'world';

interface Hit {
  doc: Doc;
  count: number;
  snippets: { text: string; ranges: [number, number][] }[];
  inTitle: boolean;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Full-text search: every term must appear (in the title or text); matches are highlighted in context. */
export function searchDocs(docs: Doc[], query: string, max = 200): Hit[] {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (!terms.length) return [];
  const res = terms.map((t) => new RegExp(escapeRe(t), 'giu'));
  const any = new RegExp(terms.map(escapeRe).join('|'), 'giu');
  const hits: Hit[] = [];
  for (const doc of docs) {
    const profile = profileOf(doc)
      .map(([k, v]) => (v ? `${k}: ${v}` : ''))
      .filter(Boolean)
      .join('\n');
    const text = [markdownToText(doc.body), profile, typeof doc.fields.synopsis === 'string' ? doc.fields.synopsis : ''].filter(Boolean).join('\n');
    const hay = `${doc.title}\n${text}`;
    if (!res.every((r) => hay.search(r) >= 0)) continue;
    const snippets: Hit['snippets'] = [];
    let count = 0;
    any.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastEnd = -1;
    while ((m = any.exec(text))) {
      count++;
      if (snippets.length < 3 && m.index > lastEnd) {
        const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, m.index - 60)) + 1);
        const endGuess = Math.min(text.length, m.index + m[0].length + 90);
        const end = text.indexOf(' ', endGuess) > 0 ? text.indexOf(' ', endGuess) : text.length;
        const slice = text.slice(start, end).replace(/\n+/g, '; ');
        const ranges: [number, number][] = [];
        const local = new RegExp(any.source, 'giu');
        let lm: RegExpExecArray | null;
        while ((lm = local.exec(slice))) ranges.push([lm.index, lm.index + lm[0].length]);
        snippets.push({ text: (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : ''), ranges: ranges.map(([a, b]) => [a + (start > 0 ? 1 : 0), b + (start > 0 ? 1 : 0)]) });
        lastEnd = end;
      }
    }
    const inTitle = res.some((r) => doc.title.search(r) >= 0);
    hits.push({ doc, count, snippets, inTitle });
    if (hits.length >= max) break;
  }
  return hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.count - a.count);
}

function Marked({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const out: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a < at) return;
    out.push(text.slice(at, a));
    out.push(<mark key={i}>{text.slice(a, b)}</mark>);
    at = b;
  });
  out.push(text.slice(at));
  return <>{out}</>;
}

function KindIcon({ doc }: { doc: Doc }) {
  if (doc.kind === 'character') return <IconCharacter />;
  if (doc.kind === 'world') {
    const I = WORLD_ICON[worldKindOf(doc)];
    return <I />;
  }
  if (doc.kind === 'chapter') return <IconChapter />;
  if (doc.kind === 'part') return <IconPart />;
  return <IconScene />;
}

export function SearchPage() {
  const q = useStore((s) => s.searchQuery);
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const [filter, setFilter] = useState<Filter>('all');
  const [debounced, setDebounced] = useState(q);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 120);
    return () => clearTimeout(t);
  }, [q]);

  const ordered = useMemo(() => {
    const manuscript = flatIds(binder)
      .map((id) => docs[id])
      .filter(Boolean);
    const ents = Object.values(docs)
      .filter((d) => d.kind === 'character' || d.kind === 'world')
      .sort((a, b) => a.title.localeCompare(b.title));
    return [...manuscript, ...ents];
  }, [docs, binder]);

  const hits = useMemo(() => {
    const pool = ordered.filter((d) =>
      filter === 'all' ? true : filter === 'characters' ? d.kind === 'character' : filter === 'world' ? d.kind === 'world' : d.kind !== 'character' && d.kind !== 'world',
    );
    return searchDocs(pool, debounced);
  }, [ordered, debounced, filter]);

  const total = hits.reduce((a, h) => a + h.count, 0);

  return (
    <article className="page wide search-page">
      <div className="search-box">
        <IconSearch />
        <input
          ref={input}
          value={q}
          placeholder="Search the whole project"
          aria-label="Search the whole project"
          onChange={(e) => store.setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) store.select(hits[0].doc.id);
          }}
        />
      </div>
      <div className="search-filters">
        <div className="segmented" role="group" aria-label="Filter results">
          {(
            [
              ['all', 'Everything'],
              ['manuscript', 'Manuscript'],
              ['characters', 'Characters'],
              ['world', 'World'],
            ] as [Filter, string][]
          ).map(([f, l]) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {l}
            </button>
          ))}
        </div>
        {debounced.trim() && (
          <span className="muted" role="status">
            {hits.length ? `${total} matches in ${hits.length} ${hits.length === 1 ? 'item' : 'items'}` : 'No matches'}
          </span>
        )}
      </div>
      <ol className="results">
        {hits.map((h) => (
          <li key={h.doc.id}>
            <button className="result" onClick={() => store.select(h.doc.id)}>
              <span className="result-head">
                <KindIcon doc={h.doc} />
                <span className="result-title">{h.doc.title || 'Untitled'}</span>
                <span className="muted">{h.count ? `${h.count}` : ''}</span>
              </span>
              {h.snippets.map((sn, i) => (
                <span className="snippet" key={i}>
                  <Marked text={sn.text} ranges={sn.ranges} />
                </span>
              ))}
            </button>
          </li>
        ))}
      </ol>
      {!debounced.trim() && <p className="muted">Searches scenes, chapter notes, character profiles and world entries.</p>}
    </article>
  );
}
