// A small, lossless Markdown dialect for prose.
// Supported: paragraphs, ## / ### headings, > quotes, *** scene breaks,
// **bold**, *italic*, ~~strike~~ and entity links [text](ink:id).
// Everything goes through a block model so the editor and the file format never drift.

export interface Inline {
  text: string;
  b?: boolean;
  i?: boolean;
  s?: boolean;
  link?: string; // entity id
}

export type BlockType = 'p' | 'h2' | 'h3' | 'quote' | 'break';

export interface Block {
  type: BlockType;
  inlines: Inline[];
}

const BREAK_RE = /^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:-[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$/;

// ---------- Markdown -> blocks ----------

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let paraType: BlockType = 'p';

  const flush = () => {
    if (para.length) {
      blocks.push({ type: paraType, inlines: parseInline(para.join(' ')) });
      para = [];
    }
    paraType = 'p';
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    if (BREAK_RE.test(line)) {
      flush();
      blocks.push({ type: 'break', inlines: [] });
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: h[1].length === 2 ? 'h2' : 'h3', inlines: parseInline(h[2]) });
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      if (para.length && paraType !== 'quote') flush();
      paraType = 'quote';
      para.push(q[1]);
      continue;
    }
    if (paraType === 'quote') flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}

type Style = Omit<Inline, 'text'>;

// Inner content is escape-aware: "\\x" is consumed as one unit so an escaped marker never closes a span.
const C = String.raw`((?:\\[\s\S]|[^\\])+?)`;
const INLINE_RE = new RegExp(
  [
    String.raw`\\([\\*_~\[\]#><])`, // 1 escape
    String.raw`\*\*\*(?=\S)` + C + String.raw`(?<=\S)\*\*\*`, // 2 bold+italic
    String.raw`\*\*(?=\S)` + C + String.raw`(?<=\S)\*\*`, // 3 bold
    String.raw`(?<![\w])__(?=\S)` + C + String.raw`(?<=\S)__(?![\w])`, // 4 bold (underscore)
    String.raw`\*(?=\S)` + C + String.raw`(?<=\S)\*`, // 5 italic
    String.raw`(?<![\w])_(?=\S)` + C + String.raw`(?<=\S)_(?![\w])`, // 6 italic (underscore)
    String.raw`~~(?=\S)` + C + String.raw`(?<=\S)~~`, // 7 strike
    String.raw`\[((?:\\.|[^\]\\])+)\]\(ink:([a-z0-9_]+)\)`, // 8,9 entity link
    String.raw`<(strong|b|em|i|del|s)>` + C + String.raw`</\10>`, // 10,11 inline HTML fallback
  ].join('|'),
);

export function parseInline(src: string, style: Style = {}): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest.length) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      push(out, { ...style, text: rest });
      break;
    }
    if (m.index > 0) push(out, { ...style, text: rest.slice(0, m.index) });
    if (m[1] !== undefined) push(out, { ...style, text: m[1] });
    else if (m[2] !== undefined) out.push(...parseInline(m[2], { ...style, b: true, i: true }));
    else if (m[3] !== undefined) out.push(...parseInline(m[3], { ...style, b: true }));
    else if (m[4] !== undefined) out.push(...parseInline(m[4], { ...style, b: true }));
    else if (m[5] !== undefined) out.push(...parseInline(m[5], { ...style, i: true }));
    else if (m[6] !== undefined) out.push(...parseInline(m[6], { ...style, i: true }));
    else if (m[7] !== undefined) out.push(...parseInline(m[7], { ...style, s: true }));
    else if (m[8] !== undefined) out.push(...parseInline(m[8], { ...style, link: m[9] }));
    else if (m[10] !== undefined) {
      const tag = m[10];
      const add: Style = tag === 'strong' || tag === 'b' ? { b: true } : tag === 'em' || tag === 'i' ? { i: true } : { s: true };
      out.push(...parseInline(m[11], { ...style, ...add }));
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return normalize(out);
}

function push(out: Inline[], run: Inline) {
  if (run.text) out.push(clean(run));
}

function clean(r: Inline): Inline {
  const c: Inline = { text: r.text };
  if (r.b) c.b = true;
  if (r.i) c.i = true;
  if (r.s) c.s = true;
  if (r.link) c.link = r.link;
  return c;
}

function sameStyle(a: Inline, b: Inline) {
  return !!a.b === !!b.b && !!a.i === !!b.i && !!a.s === !!b.s && (a.link ?? '') === (b.link ?? '');
}

/** Merge adjacent runs with the same style and drop empty ones. */
export function normalize(runs: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else out.push(clean(r));
  }
  return out;
}

// ---------- blocks -> Markdown ----------

export function serializeMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'break') {
      parts.push('***');
      continue;
    }
    const text = serializeInline(b.inlines).replace(/\s*\n\s*/g, ' ').trim();
    if (b.type === 'h2') parts.push(`## ${text}`);
    else if (b.type === 'h3') parts.push(`### ${text}`);
    else if (b.type === 'quote') parts.push(`> ${text}`);
    else if (text) parts.push(escapeLineStart(text));
  }
  return parts.join('\n\n');
}

function escapeLineStart(t: string) {
  // A paragraph must not be re-read as a heading, quote or break.
  if (/^(#|>)/.test(t) || BREAK_RE.test(t)) return '\\' + t;
  return t;
}

function esc(t: string) {
  return t.replace(/([\\*_~\[\]])/g, '\\$1').replace(/<(?=[a-zA-Z/])/g, '\\<');
}

type Key = 'link' | 'b' | 'i' | 's';
const ORDER: Key[] = ['link', 'b', 'i', 's'];

/**
 * Serialize runs as Markdown. A few style combinations have no unambiguous Markdown form
 * (for example italic text glued to bold text); those paragraphs fall back to inline HTML
 * tags, which every Markdown reader understands.
 */
export function serializeInline(runs: Inline[]): string {
  const norm = normalize(runs);
  const md = serializeRuns(norm);
  if (sameRuns(parseInline(md), norm)) return md;
  return serializeHtml(norm);
}

function sameRuns(a: Inline[], b: Inline[]) {
  return a.length === b.length && a.every((r, i) => r.text === b[i].text && sameStyle(r, b[i]));
}

function serializeHtml(runs: Inline[]): string {
  return runs
    .map((r) => {
      let t = esc(r.text);
      if (r.s) t = `<del>${t}</del>`;
      if (r.i) t = `<em>${t}</em>`;
      if (r.b) t = `<strong>${t}</strong>`;
      if (r.link) t = `[${t}](ink:${r.link})`;
      return t;
    })
    .join('');
}

function serializeRuns(runs: Inline[], keys: Key[] = ORDER): string {
  runs = normalize(runs);
  if (!keys.length) return runs.map((r) => esc(r.text)).join('');
  const [k, ...rest] = keys;
  let out = '';
  let i = 0;
  while (i < runs.length) {
    const v = runs[i][k];
    let j = i;
    while (j < runs.length && runs[j][k] === v) j++;
    const group = runs.slice(i, j);
    out += v ? wrap(k, group, rest, v as string | true) : serializeRuns(group, rest);
    i = j;
  }
  return out;
}

function wrap(k: Key, group: Inline[], rest: Key[], v: string | true): string {
  // Move leading/trailing whitespace outside the markers.
  const first = group[0];
  const last = group[group.length - 1];
  const lead = /^\s*/.exec(first.text)![0];
  const trail = /\s*$/.exec(last.text)![0];
  const g = group.map((r) => ({ ...r }));
  g[0].text = g[0].text.slice(lead.length);
  const lastG = g[g.length - 1];
  lastG.text = lastG.text.slice(0, lastG.text.length - trail.length);
  if (k === 'b' && g.every((r) => r.i)) {
    const inner3 = serializeRuns(g, rest.filter((x) => x !== 'i'));
    if (inner3) return `${lead}***${inner3}***${trail}`;
  }
  const inner = serializeRuns(g, rest);
  if (!inner) return lead + trail;
  let m: string;
  if (k === 'link') m = `[${inner}](ink:${v})`;
  else if (k === 's') m = `~~${inner}~~`;
  else if (k === 'b') m = edgeStar(inner) ? `__${inner}__` : `**${inner}**`;
  else m = edgeStar(inner) ? `_${inner}_` : `*${inner}*`;
  return lead + m + trail;
}

// ---------- blocks <-> HTML (for the editor) ----------

function edgeStar(t: string) {
  return t.startsWith('*') || /(^|[^\\])\*$/.test(t);
}

function escHtml(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function inlinesToHtml(runs: Inline[], titleOf?: (id: string) => string | undefined): string {
  return normalize(runs)
    .map((r) => {
      let h = escHtml(r.text);
      if (r.s) h = `<s>${h}</s>`;
      if (r.i) h = `<em>${h}</em>`;
      if (r.b) h = `<strong>${h}</strong>`;
      if (r.link) {
        const title = titleOf?.(r.link);
        h = `<a data-ink="${escHtml(r.link)}"${title ? ` title="${escHtml(title)}"` : ''}>${h}</a>`;
      }
      return h;
    })
    .join('');
}

export function blocksToHtml(blocks: Block[], titleOf?: (id: string) => string | undefined): string {
  if (!blocks.length) return '<p><br></p>';
  return blocks
    .map((b) => {
      if (b.type === 'break') return '<div data-break="" class="scene-break" contenteditable="false"></div>';
      const inner = inlinesToHtml(b.inlines, titleOf) || '<br>';
      if (b.type === 'quote') return `<blockquote>${inner}</blockquote>`;
      return `<${b.type}>${inner}</${b.type}>`;
    })
    .join('');
}

export function markdownToHtml(md: string, titleOf?: (id: string) => string | undefined) {
  return blocksToHtml(parseMarkdown(md), titleOf);
}

// ---------- plain text ----------

export function blocksToText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.type !== 'break')
    .map((b) => b.inlines.map((r) => r.text).join(''))
    .join('\n\n');
}

export function markdownToText(md: string) {
  return blocksToText(parseMarkdown(md));
}
