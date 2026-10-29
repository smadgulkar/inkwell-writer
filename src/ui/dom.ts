import { normalize, serializeMarkdown, type Block, type Inline } from '../model/markdown';

// Convert the editor's DOM back into the block model. Tolerant of whatever the browser
// produced while editing (divs, spans with inline styles, stray <br>s, pasted markup).

type Style = Omit<Inline, 'text'>;

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'PRE', 'SECTION', 'ARTICLE']);

export function domToBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = [];
  let pending: Inline[] = [];
  let pendingType: Block['type'] = 'p';

  const flushInline = (type: Block['type'] = pendingType) => {
    const inlines = normalize(pending);
    const text = inlines.map((r) => r.text).join('');
    if (text.trim()) {
      trimEdges(inlines);
      blocks.push({ type, inlines: normalize(inlines) });
    }
    pending = [];
  };

  const inline = (node: Node, style: Style, blockType: Block['type']) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/[\n\r\t]+/g, ' ').replace(/ /g, ' ');
      if (text) pending.push({ ...style, text });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.hasAttribute('data-break') || node.tagName === 'HR') {
      flushInline(blockType);
      blocks.push({ type: 'break', inlines: [] });
      return;
    }
    if (node.tagName === 'BR') {
      flushInline(blockType);
      return;
    }
    if (BLOCK_TAGS.has(node.tagName)) {
      flushInline(blockType);
      const t = blockTypeOf(node, blockType);
      pendingType = t;
      node.childNodes.forEach((c) => inline(c, style, t));
      flushInline(t);
      pendingType = blockType;
      return;
    }
    const s: Style = { ...style };
    const tag = node.tagName;
    if (tag === 'B' || tag === 'STRONG') s.b = true;
    if (tag === 'I' || tag === 'EM') s.i = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') s.s = true;
    if (tag === 'A' && node.dataset.ink) s.link = node.dataset.ink;
    const st = node.style;
    if (st) {
      const fw = st.fontWeight;
      if (fw === 'bold' || Number(fw) >= 600) s.b = true;
      if (fw === 'normal' || (fw && Number(fw) > 0 && Number(fw) < 600)) s.b = false;
      if (st.fontStyle === 'italic') s.i = true;
      if (st.fontStyle === 'normal') s.i = false;
      if (st.textDecoration?.includes('line-through') || st.textDecorationLine?.includes('line-through')) s.s = true;
    }
    node.childNodes.forEach((c) => inline(c, s, blockType));
  };

  root.childNodes.forEach((n) => inline(n, {}, 'p'));
  flushInline('p');
  return blocks;
}

function blockTypeOf(el: HTMLElement, parent: Block['type']): Block['type'] {
  switch (el.tagName) {
    case 'H1':
    case 'H2':
      return 'h2';
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return 'h3';
    case 'BLOCKQUOTE':
      return 'quote';
    default:
      return parent === 'quote' ? 'quote' : 'p';
  }
}

function trimEdges(runs: Inline[]) {
  if (!runs.length) return;
  runs[0].text = runs[0].text.replace(/^\s+/, '');
  const last = runs[runs.length - 1];
  last.text = last.text.replace(/\s+$/, '');
  for (const r of runs) r.text = r.text.replace(/ {2,}/g, ' ');
}

export function domToMarkdown(root: HTMLElement): string {
  return serializeMarkdown(domToBlocks(root));
}

/** Markdown for a DOM fragment (used when splitting a scene). */
export function fragmentToMarkdown(frag: DocumentFragment): string {
  const div = document.createElement('div');
  div.appendChild(frag);
  return domToMarkdown(div);
}

/** The top-level block element containing a node. */
export function topBlock(root: HTMLElement, node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n instanceof HTMLElement ? n : null;
}

export function countWordsIn(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
