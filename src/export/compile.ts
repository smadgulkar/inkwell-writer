// Turn a project into an ordered, filtered book: sections of plain blocks, ready for any writer.
import { flatIds, parentOf } from '../model/binder';
import { kindOf } from '../model/ids';
import { parseMarkdown, type Block, type Inline } from '../model/markdown';
import { countText } from '../model/words';
import { STATUSES, type BinderNode, type Doc, type Mode, type Status } from '../model/types';

export type Separator = '#' | '* * *' | '⁂' | 'blank';
export type ChapterHeading = 'number-title' | 'number' | 'title' | 'none';
export type NumberStyle = 'words' | 'digits' | 'roman';

export interface ExportOptions {
  statuses: Status[];
  excludeTags: string[];
  separator: Separator;
  chapterHeading: ChapterHeading;
  numberStyle: NumberStyle;
  sceneTitles: boolean;
  titlePage: boolean;
  /** Name on the cover and in the byline. */
  byline: string;
  /** Legal name for the contact block, when it differs from the byline. */
  legalName: string;
  contact: string;
  font: 'courier' | 'times';
  endMark: boolean;
  /** Restrict to one part or chapter (a story in a collection). */
  root: string | null;
}

export const DEFAULT_EXPORT: ExportOptions = {
  statuses: [...STATUSES],
  excludeTags: [],
  separator: '#',
  chapterHeading: 'number-title',
  numberStyle: 'words',
  sceneTitles: false,
  titlePage: true,
  byline: '',
  legalName: '',
  contact: '',
  font: 'courier',
  endMark: true,
  root: null,
};

export interface Section {
  kind: 'part' | 'chapter' | 'loose';
  id: string | null;
  /** "Chapter One", "Part Two"… when numbered. */
  label: string | null;
  title: string | null;
  blocks: Block[];
}

export interface Compiled {
  title: string;
  author: string;
  mode: Mode;
  sections: Section[];
  words: number;
  scenes: number;
  /** A reference document (story bible) rather than prose. */
  reference?: boolean;
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numberWords(n % 100) : '');
  return String(n);
}

export function roman(n: number): string {
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) (out += s), (n -= v);
  return out;
}

const cap = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function formatNumber(n: number, style: NumberStyle) {
  return style === 'digits' ? String(n) : style === 'roman' ? roman(n) : cap(numberWords(n));
}

/** Rounded the way manuscripts state length: "about 4,300 words". */
export function roundedWords(n: number) {
  if (n < 1000) return Math.max(10, Math.round(n / 10) * 10);
  if (n < 20000) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
}

const tagsOf = (d: Doc) => (Array.isArray(d.fields.tags) ? (d.fields.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []);
const statusOf = (d: Doc): Status => (STATUSES.includes(d.fields.status as Status) ? (d.fields.status as Status) : 'draft');

/** Entity links become their visible text; everything else is kept. */
function plain(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, inlines: b.inlines.map(({ link: _link, ...r }) => r as Inline) }));
}

export function sceneIncluded(d: Doc | undefined, o: ExportOptions) {
  if (!d) return false;
  if (!o.statuses.includes(statusOf(d))) return false;
  const tags = tagsOf(d).map((t) => t.toLowerCase());
  return !o.excludeTags.some((t) => tags.includes(t.toLowerCase()));
}

function subtree(binder: BinderNode[], root: string | null): BinderNode[] {
  if (!root) return binder;
  const find = (nodes: BinderNode[]): BinderNode | null => {
    for (const n of nodes) {
      if (n.id === root) return n;
      const f = n.children ? find(n.children) : null;
      if (f) return f;
    }
    return null;
  };
  const n = find(binder);
  return n ? [n] : [];
}

export function compile(meta: { title: string; author?: string; mode: Mode; binder: BinderNode[] }, docs: Record<string, Doc>, o: ExportOptions): Compiled {
  const tree = subtree(meta.binder, o.root);
  const sections: Section[] = [];
  let chapterNo = 0;
  let partNo = 0;
  let scenes = 0;
  let words = 0;
  const bySection = new Map<string, Section>();
  const ids = flatIds(tree);
  // A story chosen from a collection is the whole book: its own title is the book title.
  const rootIsBook = !!o.root && kindOf(o.root) !== 'scene';
  for (const id of ids) {
    const k = kindOf(id);
    const d = docs[id];
    if (!d) continue;
    if (rootIsBook && id === o.root) continue;
    if (k === 'part') {
      partNo++;
      const label = `Part ${formatNumber(partNo, o.numberStyle)}`;
      // Titles that already say "Part One: …" keep their own wording.
      const named = !!d.title && /^part\b/i.test(d.title.trim());
      sections.push({ kind: 'part', id, label: named ? null : label, title: d.title || null, blocks: [] });
    } else if (k === 'chapter') {
      chapterNo++;
      const label = o.chapterHeading === 'number-title' || o.chapterHeading === 'number' ? `Chapter ${formatNumber(chapterNo, o.numberStyle)}` : null;
      const title = o.chapterHeading === 'number-title' || o.chapterHeading === 'title' ? d.title || null : null;
      const s: Section = { kind: 'chapter', id, label, title, blocks: [] };
      sections.push(s);
      bySection.set(id, s);
    } else if (k === 'scene') {
      if (!sceneIncluded(d, o)) continue;
      const p = parentOf(tree, id);
      let s = p ? bySection.get(p.id) : undefined;
      if (!s) {
        const last = sections[sections.length - 1];
        if (last && last.kind === 'loose' && last.id === (p?.id ?? null)) s = last;
        else {
          s = { kind: 'loose', id: p?.id ?? null, label: null, title: null, blocks: [] };
          sections.push(s);
        }
      }
      const blocks = plain(parseMarkdown(d.body));
      if (!blocks.length && !o.sceneTitles) continue;
      if (s.blocks.length) s.blocks.push({ type: 'break', inlines: [] });
      if (o.sceneTitles && d.title) s.blocks.push({ type: 'h3', inlines: [{ text: d.title }] });
      s.blocks.push(...blocks);
      scenes++;
      for (const b of blocks) if (b.type !== 'break') words += countText(b.inlines.map((r) => r.text).join(''));
    }
  }
  // Drop chapters left empty by the filters, and parts left with no chapters.
  const kept = sections.filter((s) => s.kind === 'part' || s.blocks.length);
  const final = kept.filter((s, i) => s.kind !== 'part' || (kept[i + 1] && kept[i + 1].kind !== 'part'));
  const title = rootIsBook && o.root ? docs[o.root]?.title || meta.title : meta.title;
  return { title: title || 'Untitled', author: o.byline || meta.author || '', mode: meta.mode, sections: final, words, scenes };
}

export function separatorText(sep: Separator) {
  return sep === 'blank' ? '' : sep;
}

export function surnameOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || 'Author';
}

/** A short form of the title for running heads. */
export function shortTitle(title: string) {
  const t = title.replace(/^(the|a|an)\s+/i, '');
  const words = t.split(/\s+/);
  return (words.length > 3 ? words.slice(0, 3).join(' ') : t).toUpperCase();
}

export const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
