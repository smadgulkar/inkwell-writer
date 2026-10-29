// Ideas: loose notes about characters, plot, places, events or scenes, sorted automatically.
// Everything here is pure and runs offline. The optional Claude assistant (src/ideas/ai.ts)
// only refines what this produces.

import { sceneOrder } from './binder';
import { aliasesOf, worldKindOf } from './entities';
import { kindOf } from './ids';
import type { MentionIndex } from './mentions';
import { sceneSubplots } from './subplots';
import type { BinderNode, Doc } from './types';

export const IDEA_TYPES = ['character', 'plot', 'place', 'world', 'event', 'scene', 'line', 'theme', 'other'] as const;
export type IdeaType = (typeof IDEA_TYPES)[number];
export const IDEA_TYPE_LABEL: Record<IdeaType, string> = {
  character: 'Character',
  plot: 'Plot',
  place: 'Place',
  world: 'Worldbuilding',
  event: 'Event',
  scene: 'Scene',
  line: 'A line',
  theme: 'Theme',
  other: 'Note',
};

export const IDEA_STATUSES = ['new', 'kept', 'used', 'dropped'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = { new: 'New', kept: 'Kept', used: 'Used', dropped: 'Set aside' };

export interface Idea {
  id: string;
  title: string;
  text: string;
  type: IdeaType;
  /** True until the writer picks a type themselves. */
  typeAuto: boolean;
  status: IdeaStatus;
  /** Entities the writer linked by hand. */
  links: string[];
  /** Detected links the writer removed. */
  unlinked: string[];
  /** Scene or chapter the idea is pinned to. */
  target: string | null;
  usedIn: string | null;
  created: string;
}

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function ideaOf(d: Doc): Idea {
  const t = d.fields.ideaType as IdeaType;
  const st = d.fields.status as IdeaStatus;
  return {
    id: d.id,
    title: d.title,
    text: d.body,
    type: IDEA_TYPES.includes(t) ? t : 'other',
    typeAuto: d.fields.typeAuto !== false,
    status: IDEA_STATUSES.includes(st) ? st : 'new',
    links: strs(d.fields.links),
    unlinked: strs(d.fields.unlinked),
    target: typeof d.fields.target === 'string' && d.fields.target ? d.fields.target : null,
    usedIn: typeof d.fields.usedIn === 'string' && d.fields.usedIn ? d.fields.usedIn : null,
    created: typeof d.fields.created === 'string' ? d.fields.created : '',
  };
}

/** A short title from the first sentence. */
export function ideaTitle(text: string) {
  const first = text
    .replace(/\[([^\]]*)\]\(ink:[a-z0-9_]+\)/g, '$1')
    .replace(/[*_~#>]/g, '')
    .trim()
    .split(/\n/)[0]
    .trim();
  return clip(firstSentence(first));
}

/** The first sentence, never cutting inside quotation marks. */
function firstSentence(t: string) {
  let open = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    // An apostrophe ("don’t") sits between letters; a closing quote does not.
    if ((c === '’' || c === '‘') && /\p{L}/u.test(t[i - 1] ?? '') && /\p{L}/u.test(t[i + 1] ?? '')) continue;
    if (c === '“' || c === '‘') open++;
    else if ((c === '”' || c === '’') && open) open--;
    else if (c === '"') open = open ? 0 : 1;
    else if ((c === '.' || c === '!' || c === '?') && !open && /\s/.test(t[i + 1] ?? '')) return t.slice(0, i + 1);
  }
  return t;
}

function clip(first: string) {
  if (first.length <= 72) return first.replace(/[.]$/, '');
  const cut = first.slice(0, 62);
  return cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 62) + '…';
}

// ---------- type ----------

const CUES: Record<Exclude<IdeaType, 'other'>, RegExp[]> = {
  character: [/\b(character|backstory|motivation|personality|trait|childhood|her past|his past|their past|secret(ly)? (wants|fears|loves)|wants to|is afraid|fears|voice|arc|grew up|mother|father|sister|brother|daughter|son|lover|rival|mentor|villain|antagonist|protagonist|nickname)\b/i],
  plot: [/\b(plot|twist|reveal(ed|s)?|turns out|betray(s|al|ed)?|subplot|midpoint|climax|ending|stakes|what if|conflict|mystery|clue|foreshadow\w*|red herring|act (one|two|three|1|2|3)|inciting|resolution|payoff|set ?up|reversal)\b/i],
  place: [/\b(town|city|village|mountain|river|valley|desert|forest|inn|tavern|castle|station|harbou?r|port|island|road|ruins?|market|temple|landscape|region|border|coast|map|street|house|camp|cave|lake|sea|flats)\b/i],
  world: [/\b(magic|spell|religion|gods?|goddess|ritual|custom|law|guild|language|technology|culture|faction|empire|kingdom|currency|calendar|species|tradition|myth|legend|creed|church|order of)\b/i],
  event: [/\b(years? (ago|before|after)|centur(y|ies)|war|flood|famine|plague|festival|battle|coronation|founding|massacre|the day (when|that)|in the year|history of|happened|anniversary|drought|uprising)\b/i, /\b\d{2,4} ?(AT|AD|BC|BCE|CE)\b/],
  scene: [/\b(scene|opens? (with|on)|opening|chapter|flashback|cut to|confront(s|ation)?|chase|fight|argument|dialogue|meets?|arrives?|walks? in|wakes|at night|in the rain|over dinner|a moment where|show (her|him|them)|beat)\b/i],
  line: [/^["“‘'].{4,}["”’']\s*$/s, /^(line|dialogue|quote)\s*[:—-]/i],
  theme: [/\b(theme|motif|symbol(ism|ic)?|meaning|metaphor|is (really )?about|grief|redemption|identity|belonging|forgiveness|guilt|memory|freedom)\b/i],
};

const HASHTAG: Record<string, IdeaType> = {
  char: 'character', character: 'character', who: 'character',
  plot: 'plot', twist: 'plot',
  place: 'place', setting: 'place', location: 'place',
  world: 'world', lore: 'world', magic: 'world',
  event: 'event', history: 'event',
  scene: 'scene', line: 'line', dialogue: 'line', quote: 'line',
  theme: 'theme', motif: 'theme', note: 'other',
};

export interface TypeGuess {
  type: IdeaType;
  confidence: number; // 0..1
  scores: Partial<Record<IdeaType, number>>;
}

/** Guess what kind of idea a note is, from its words and what it mentions. */
export function guessType(text: string, mentioned: Doc[] = []): TypeGuess {
  const scores: Partial<Record<IdeaType, number>> = {};
  const add = (t: IdeaType, n: number) => (scores[t] = (scores[t] ?? 0) + n);
  const tag = /(?:^|\s)#([a-z]+)\b|^([a-z]+)\s*:/i.exec(text.trim());
  const explicit = tag && HASHTAG[(tag[1] ?? tag[2]).toLowerCase()];
  if (explicit) return { type: explicit, confidence: 1, scores: { [explicit]: 10 } };
  for (const [t, res] of Object.entries(CUES) as [IdeaType, RegExp[]][]) {
    for (const re of res) {
      const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
      const n = [...text.matchAll(new RegExp(re.source, flags))].length;
      if (n) add(t, (t === 'line' ? 4 : 1.2) * Math.min(n, 3));
    }
  }
  const chars = mentioned.filter((d) => d.kind === 'character');
  const places = mentioned.filter((d) => d.kind === 'world' && worldKindOf(d) === 'place');
  const lore = mentioned.filter((d) => d.kind === 'world' && worldKindOf(d) !== 'place');
  if (chars.length === 1) add('character', 1);
  if (chars.length >= 2) add('scene', 0.8), add('plot', 0.6);
  if (places.length) add('place', 0.8), add('scene', 0.3);
  if (lore.length) add('world', 1);
  if (mentioned.some((d) => d.kind === 'subplot')) add('plot', 1.5);
  if (mentioned.some((d) => d.kind === 'scene' || d.kind === 'chapter')) add('scene', 1.2);
  // A short line in quotation marks is almost certainly dialogue.
  if (/["“].+["”]/.test(text) && text.length < 220) add('line', 1.5);
  const ranked = (Object.entries(scores) as [IdeaType, number][]).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { type: 'other', confidence: 0, scores };
  const [best, second] = ranked;
  const total = ranked.reduce((a, [, n]) => a + n, 0);
  return { type: best[0], confidence: Math.min(1, (best[1] - (second?.[1] ?? 0) * 0.5) / Math.max(total, 1.5)), scores };
}

// ---------- links ----------

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Names a note could use for a document. */
function termsFor(d: Doc): string[] {
  const bare = (t: string) => t.replace(/^(the|a|an)\s+/i, '');
  if (d.kind === 'character' || d.kind === 'world') {
    const t = [d.title, ...aliasesOf(d)].filter((x) => x && x.length > 1);
    // "Salt Flats" for "The Salt Flats"; first names: "Mara" for "Mara Venn".
    for (const x of [...t]) if (bare(x) !== x && bare(x).length > 2) t.push(bare(x));
    if (d.kind === 'character' && d.title.includes(' ')) t.push(d.title.split(' ')[0]);
    return t;
  }
  // Scenes, chapters, subplots and events only by distinctive (two-word) titles.
  const title = bare(d.title.trim());
  if (['scene', 'chapter', 'subplot', 'event'].includes(d.kind) && title.split(/\s+/).length >= 2) return [title];
  return [];
}

/** Entities, subplots, scenes and chapters a note mentions, by link or by name. */
export function detectLinks(text: string, docs: Record<string, Doc>): string[] {
  const linked: string[] = [];
  for (const m of text.matchAll(/\]\(ink:([a-z0-9_]+)\)/g)) if (docs[m[1]] && !linked.includes(m[1])) linked.push(m[1]);
  const plain = text.replace(/\]\(ink:[a-z0-9_]+\)/g, ']').replace(/[*_~[\]\\]/g, '');
  const hits: { id: string; start: number; end: number }[] = [];
  for (const d of Object.values(docs)) {
    if (linked.includes(d.id)) continue;
    if (!['character', 'world', 'subplot', 'scene', 'chapter', 'event'].includes(d.kind)) continue;
    const terms = termsFor(d);
    if (!terms.length) continue;
    const ci = d.kind !== 'character' && d.kind !== 'world';
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, ci ? 'giu' : 'gu');
    for (const m of plain.matchAll(re)) hits.push({ id: d.id, start: m.index!, end: m.index! + m[0].length });
  }
  // Longer names win where two overlap ("Salt Flats" over "Flats").
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  const order = new Map<string, number>();
  for (const h of kept) if (!order.has(h.id) || order.get(h.id)! > h.start) order.set(h.id, h.start);
  return [...linked, ...[...order.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)];
}

/** What an idea is about: detected links (minus ones removed) plus hand-made ones. */
export function ideaLinks(idea: Idea, docs: Record<string, Doc>): string[] {
  const out = detectLinks(idea.text, docs).filter((id) => !idea.unlinked.includes(id));
  for (const id of idea.links) if (docs[id] && !out.includes(id)) out.push(id);
  return out.filter((id) => id !== idea.id);
}

// ---------- words ----------

const STOP = new Set(
  'about above after again against also although among because been before being below between both could does doing down during each even every from further have having here hers herself himself into itself just more most much must myself never once only other ought ours over same should some such than that their theirs them themselves then there these they this those through under until very want were what when where which while whom whose will with would your yours yourself the and but for not you she her his him its our out who why how can did had has was are all any few nor own off too one two may might shall'.split(
    ' ',
  ),
);

export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().replace(/\(ink:[a-z0-9_]+\)/g, '').match(/[\p{L}']{4,}/gu) ?? []) {
    if (STOP.has(w)) continue;
    out.add(w.replace(/(ings?|ed|es|s|ly)$/u, '').replace(/'s$/, ''));
  }
  return out;
}

const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
};

// ---------- where it might go ----------

export interface Placement {
  id: string;
  score: number;
  /** Plain-language reasons, e.g. "Tess and Brine are in this scene". */
  why: string;
}

/** The scenes an idea most likely belongs to, best first. */
export function suggestPlacements(idea: Idea, docs: Record<string, Doc>, binder: BinderNode[], index: MentionIndex, limit = 3): Placement[] {
  const links = ideaLinks(idea, docs);
  const kw = keywords(idea.text);
  const linkedEntities = links.filter((id) => ['character', 'world'].includes(kindOf(id) ?? ''));
  const linkedSubplots = links.filter((id) => kindOf(id) === 'subplot');
  const out: Placement[] = [];
  for (const sid of sceneOrder(binder)) {
    const s = docs[sid];
    if (!s) continue;
    let score = 0;
    const reasons: string[] = [];
    if (links.includes(sid)) {
      score += 6;
      reasons.push('named in the idea');
    }
    const present = index.byScene.get(sid) ?? new Set<string>();
    const shared = linkedEntities.filter((e) => present.has(e) || s.fields.pov === e || s.fields.location === e);
    if (shared.length) {
      score += 2.5 * shared.length + (shared.length === linkedEntities.length && shared.length > 1 ? 2 : 0);
      reasons.push(`${shared.map((e) => docs[e]?.title).join(' and ')} ${shared.length > 1 ? 'are' : 'is'} here`);
    }
    const subs = sceneSubplots(s, docs).filter((x) => linkedSubplots.includes(x));
    if (subs.length) {
      score += 3 * subs.length;
      reasons.push(`part of ${subs.map((x) => docs[x]?.title).join(', ')}`);
    }
    const words = overlap(kw, keywords(`${s.title} ${typeof s.fields.synopsis === 'string' ? s.fields.synopsis : ''}`));
    const bodyWords = words ? 0 : overlap(kw, keywords(s.body.slice(0, 4000)));
    if (words) {
      score += 1.6 * words;
      reasons.push('similar synopsis');
    } else if (bodyWords >= 2) score += 0.5 * bodyWords;
    if (score >= 2.5) out.push({ id: sid, score, why: reasons.join('; ') || 'similar words' });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- related ideas ----------

export function relatedIdeas(idea: Idea, all: Idea[], docs: Record<string, Doc>, limit = 4): { id: string; score: number }[] {
  const mine = new Set(ideaLinks(idea, docs));
  const kw = keywords(idea.text);
  return all
    .filter((o) => o.id !== idea.id)
    .map((o) => {
      const theirs = ideaLinks(o, docs);
      const shared = theirs.filter((x) => mine.has(x)).length;
      const words = overlap(kw, keywords(o.text));
      return { id: o.id, score: shared * 2 + words * 0.8 + (o.target && o.target === idea.target ? 2 : 0) };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Which "Use it" actions make sense for an idea, most likely first. */
export function useOptions(type: IdeaType): ('scene' | 'character' | 'place' | 'world' | 'event' | 'subplot')[] {
  switch (type) {
    case 'character':
      return ['character', 'scene', 'subplot'];
    case 'place':
      return ['place', 'scene'];
    case 'world':
      return ['world', 'event'];
    case 'event':
      return ['event', 'scene'];
    case 'plot':
      return ['subplot', 'scene', 'event'];
    case 'scene':
    case 'line':
      return ['scene', 'subplot'];
    default:
      return ['scene', 'character', 'place', 'event', 'subplot'];
  }
}
