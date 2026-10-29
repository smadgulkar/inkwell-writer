import { mentionTerms } from './entities';
import type { Doc } from './types';

// Which entities appear in which scenes: explicit [links](ink:id), POV/location fields,
// and plain-text mentions of a name or alias. Pure and cheap enough to recompute on edit.

export interface Appearance {
  sceneId: string;
  /** Plain-text mentions plus links. */
  count: number;
  linked: boolean;
  pov: boolean;
  location: boolean;
}

export interface MentionIndex {
  /** entity id -> appearances, in manuscript order */
  byEntity: Map<string, Appearance[]>;
  /** scene id -> entity ids present */
  byScene: Map<string, Set<string>>;
}

const LINK_RE = /\]\(ink:([a-z0-9_]+)\)/g;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const termRegexCache = new Map<string, RegExp | null>();
function termRegex(terms: string[]): RegExp | null {
  const key = terms.join('\u0000');
  if (termRegexCache.has(key)) return termRegexCache.get(key)!;
  // Longest first so "Mara Venn" wins over "Mara". Names match case-sensitively.
  const sorted = [...terms].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = sorted.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
  if (termRegexCache.size > 2000) termRegexCache.clear();
  termRegexCache.set(key, re);
  return re;
}

/** Strip link targets and markup so "ink:cr_x" and markers don't count as text. */
function proseText(md: string) {
  return md.replace(/\]\(ink:[a-z0-9_]+\)/g, ']').replace(/[*_~[\]\\]/g, '');
}

export function buildMentionIndex(docs: Record<string, Doc>, sceneOrder: string[]): MentionIndex {
  const entities = Object.values(docs).filter((d) => d.kind === 'character' || d.kind === 'world');
  const matchers = entities.map((e) => ({ id: e.id, re: termRegex(mentionTerms(e)) }));
  const byEntity = new Map<string, Appearance[]>();
  const byScene = new Map<string, Set<string>>();

  for (const sceneId of sceneOrder) {
    const scene = docs[sceneId];
    if (!scene) continue;
    const present = new Set<string>();
    const linkCounts = new Map<string, number>();
    for (const m of scene.body.matchAll(LINK_RE)) linkCounts.set(m[1], (linkCounts.get(m[1]) ?? 0) + 1);
    const text = proseText(scene.body);
    const pov = typeof scene.fields.pov === 'string' ? scene.fields.pov : null;
    const location = typeof scene.fields.location === 'string' ? scene.fields.location : null;

    for (const { id, re } of matchers) {
      const linked = linkCounts.get(id) ?? 0;
      let textCount = 0;
      if (re) {
        re.lastIndex = 0;
        textCount = text.match(re)?.length ?? 0;
      }
      const isPov = pov === id;
      const isLoc = location === id;
      // Linked text is also counted by the name match when the link text is the name; take the max.
      const count = Math.max(textCount, linked);
      if (count > 0 || isPov || isLoc) {
        present.add(id);
        const list = byEntity.get(id) ?? [];
        list.push({ sceneId, count, linked: linked > 0, pov: isPov, location: isLoc });
        byEntity.set(id, list);
      }
    }
    byScene.set(sceneId, present);
  }
  return { byEntity, byScene };
}
