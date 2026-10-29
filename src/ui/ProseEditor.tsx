import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { markdownToHtml } from '../model/markdown';
import { store } from '../store/store';
import { countWordsIn, domToMarkdown, fragmentToMarkdown, topBlock } from './dom';
import { fuzzy } from './Palette';
import { IconPlus } from './icons';
import type { PickOption } from './pickers';

export interface EditorApi {
  splitAtCursor(): { before: string; after: string } | null;
  insertBreak(): void;
  focus(atEnd?: boolean): void;
  /** Record the current caret if it is inside this editor (call before focus moves away). */
  remember(): void;
}

/** The currently focused editor, so commands (palette, shortcuts) can act on it. */
export const activeEditor: { current: EditorApi | null } = { current: null };
store.beforeOverlay = () => activeEditor.current?.remember();

interface Props {
  docId: string;
  markdown: string;
  /** Changes when the doc was modified outside this editor and must be reloaded. */
  rev: number;
  /** Called with the markdown and the id of the doc it belongs to. */
  onChange(md: string, docId: string): void;
  onSelectionWords?(n: number): void;
  titleOf?(id: string): string | undefined;
  placeholder?: string;
  className?: string;
  typewriter?: boolean;
  scrollParent?: () => HTMLElement | null;
  /** Entities offered when typing @. */
  mentionOptions?(): PickOption[];
  /** Create a character named after the @query; returns its id. */
  onCreateMention?(name: string): string | null;
  /** Ctrl/Cmd+click on an entity link. */
  onOpenLink?(id: string): void;
}

interface MentionState {
  query: string;
  x: number;
  y: number;
  sel: number;
}

const MENTION_RE = /(?:^|[\s(“"‘'—])@([^\s@][^@\n]{0,30}|)$/;

const SERIALIZE_DELAY = 250;
const BREAK_LINE = /^\s*(\*\s*){3,}$/;

export function ProseEditor(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastMd = useRef<string>('');
  const loadedId = useRef<string>('');
  const lastCurrentRef = useRef<HTMLElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [mention, setMention] = useState<MentionState | null>(null);
  const mentionRef = useRef<MentionState | null>(null);
  mentionRef.current = mention;

  const mentionItems = useMemo(() => {
    if (!mention || !props.mentionOptions) return [];
    const q = mention.query.trim();
    const opts = props.mentionOptions();
    const list: (PickOption & { create?: boolean })[] = opts
      .map((o) => ({ o, m: fuzzy(q, o.title) }))
      .filter((x) => x.m)
      .sort((a, b) => (q ? b.m!.score - a.m!.score : a.o.title.localeCompare(b.o.title)))
      .slice(0, 8)
      .map((x) => x.o);
    if (q && props.onCreateMention && !opts.some((o) => o.title.toLowerCase() === q.toLowerCase())) {
      list.push({ id: '__create', title: `New character “${q}”`, create: true, icon: <IconPlus width={15} height={15} /> });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mention?.query, props.mentionOptions]);
  const itemsRef = useRef(mentionItems);
  itemsRef.current = mentionItems;

  function closeMention() {
    if (mentionRef.current) setMention(null);
  }

  /** Open, update or close the @ menu based on the text just before the caret. */
  function detectMention() {
    if (!propsRef.current.mentionOptions) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !ref.current?.contains(node) || node.parentElement?.closest('a[data-ink]')) {
      closeMention();
      return;
    }
    const before = (node.textContent ?? '').slice(0, sel.anchorOffset);
    const m = MENTION_RE.exec(before);
    if (!m || /\s{2}/.test(m[1])) {
      closeMention();
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const prev = mentionRef.current;
    setMention({ query: m[1], x: r.left, y: r.bottom, sel: prev && prev.query === m[1] ? prev.sel : 0 });
  }

  function chooseMention(item: PickOption & { create?: boolean }) {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const cur = mentionRef.current;
    setMention(null);
    if (!sel || !node || node.nodeType !== Node.TEXT_NODE || !cur) return;
    const offset = sel.anchorOffset;
    const at = (node.textContent ?? '').slice(0, offset).lastIndexOf('@');
    if (at < 0) return;
    let id = item.id;
    let title = item.title;
    if (item.create) {
      title = cur.query.trim();
      const created = propsRef.current.onCreateMention?.(title);
      if (!created) return;
      id = created;
    }
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, offset);
    range.deleteContents();
    const a = document.createElement('a');
    a.setAttribute('data-ink', id);
    a.title = title;
    a.textContent = title;
    const space = document.createTextNode('\u00a0');
    range.insertNode(space);
    range.insertNode(a);
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    onInput();
  }

  // Load content when the doc changes (or is changed externally).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (timer.current) flush();
    el.innerHTML = markdownToHtml(props.markdown, props.titleOf);
    lastMd.current = props.markdown;
    loadedId.current = props.docId;
    lastCurrentRef.current = null;
    savedRange.current = null;
    updateEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.docId, props.rev]);

  // Flush pending edits on unmount.
  useEffect(() => () => flush(), []);

  function updateEmpty() {
    const el = ref.current!;
    const empty = !el.textContent?.trim() && !el.querySelector('[data-break]');
    el.classList.toggle('is-empty', empty);
  }

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const el = ref.current;
    if (!el) return;
    const md = domToMarkdown(el);
    if (md !== lastMd.current) {
      lastMd.current = md;
      propsRef.current.onChange(md, loadedId.current);
    }
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SERIALIZE_DELAY);
  }

  function onInput() {
    const el = ref.current!;
    // Keep the root made of block elements: wrap stray text nodes.
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) {
        const p = document.createElement('p');
        el.replaceChild(p, n);
        p.appendChild(n);
        placeCaret(p, true);
      }
    });
    if (!el.firstChild) el.innerHTML = '<p><br></p>';
    updateEmpty();
    schedule();
    trackCurrent();
    detectMention();
  }

  function currentBlock(): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !ref.current) return null;
    return topBlock(ref.current, sel.anchorNode);
  }

  function trackCurrent() {
    const b = currentBlock();
    const last = lastCurrentRef.current;
    if (b !== last) {
      last?.classList.remove('is-current');
      b?.classList.add('is-current');
      lastCurrentRef.current = b;
    }
    if (propsRef.current.typewriter) typewriterScroll();
  }

  function typewriterScroll() {
    const sel = window.getSelection();
    const sp = propsRef.current.scrollParent?.();
    if (!sel?.rangeCount || !sp) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.height) return;
    const box = sp.getBoundingClientRect();
    const target = box.top + box.height * 0.45;
    sp.scrollTop += r.top - target;
  }

  function insertBreakAt(block: HTMLElement | null) {
    const el = ref.current!;
    const brk = document.createElement('div');
    brk.className = 'scene-break';
    brk.setAttribute('data-break', '');
    brk.contentEditable = 'false';
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    if (block && block.parentNode === el) {
      if (BREAK_LINE.test(block.textContent ?? '') || !block.textContent?.trim()) {
        el.replaceChild(brk, block);
      } else {
        block.after(brk);
      }
    } else {
      el.appendChild(brk);
    }
    brk.after(p);
    placeCaret(p, false);
    onInput();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    const mm = mentionRef.current;
    if (mm && itemsRef.current.length) {
      const n = itemsRef.current.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setMention({ ...mm, sel: (mm.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        chooseMention(itemsRef.current[Math.min(mm.sel, n - 1)]);
        return;
      }
    }
    if (mm && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setMention(null);
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault();
      document.execCommand(e.key === 'b' ? 'bold' : 'italic');
      onInput();
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      document.execCommand('strikeThrough');
      onInput();
      return;
    }
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      insertBreakAt(currentBlock());
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      const b = currentBlock();
      if (b && BREAK_LINE.test(b.textContent ?? '')) {
        e.preventDefault();
        insertBreakAt(b);
      }
    }
    if (e.key === 'Backspace') {
      // Backspace at the start of the paragraph after a scene break removes the break.
      const sel = window.getSelection();
      const b = currentBlock();
      if (sel?.isCollapsed && b && atStart(b, sel) && b.previousElementSibling?.hasAttribute('data-break')) {
        e.preventDefault();
        b.previousElementSibling.remove();
        onInput();
      }
    }
  }

  // Smart punctuation as you type. (Native listener: React's onBeforeInput is a polyfill without inputType.)
  function onBeforeInput(ne: InputEvent) {
    const e = ne;
    if (ne.inputType !== 'insertText' || !ne.data) return;
    const ch = ne.data;
    if (ch !== '"' && ch !== "'" && ch !== '-') return;
    const sel = window.getSelection();
    if (!sel?.isCollapsed || !sel.anchorNode) return;
    const before = sel.anchorNode.nodeType === Node.TEXT_NODE ? (sel.anchorNode.textContent ?? '').slice(0, sel.anchorOffset) : '';
    const prev = before.slice(-1);
    if (ch === '-') {
      if (prev === '-') {
        e.preventDefault();
        document.execCommand('delete');
        document.execCommand('insertText', false, '—');
      }
      return;
    }
    const opening = !prev || /[\s([{“‘—–-]/.test(prev);
    e.preventDefault();
    const out = ch === '"' ? (opening ? '“' : '”') : opening ? '‘' : '’';
    document.execCommand('insertText', false, out);
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n|\n/).map((t) => t.trim()).filter(Boolean);
    if (paras.length <= 1) {
      document.execCommand('insertText', false, paras[0] ?? text);
    } else {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      document.execCommand('insertHTML', false, paras.map((p) => (BREAK_LINE.test(p) ? '<div data-break="" class="scene-break" contenteditable="false"></div>' : `<p>${esc(p)}</p>`)).join(''));
    }
    onInput();
  }

  function onSelect() {
    trackCurrent();
    const sel = window.getSelection();
    const n = sel && !sel.isCollapsed && ref.current?.contains(sel.anchorNode) ? countWordsIn(sel.toString()) : 0;
    propsRef.current.onSelectionWords?.(n);
  }

  useEffect(() => {
    const el = ref.current!;
    const handler = () => {
      // Track the caret by where the selection is, not by focus: commands run from
      // overlays (the palette) need the last caret position inside this editor.
      if (remember()) {
        onSelect();
        if (mentionRef.current) detectMention();
      }
    };
    const bi = (e: Event) => onBeforeInput(e as InputEvent);
    document.addEventListener('selectionchange', handler);
    el.addEventListener('beforeinput', bi);
    return () => {
      document.removeEventListener('selectionchange', handler);
      el.removeEventListener('beforeinput', bi);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function remember(): boolean {
    const el = ref.current;
    const sel = window.getSelection();
    if (el && sel?.rangeCount && el.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
      return true;
    }
    return false;
  }

  /** Put the caret back where it was if focus moved elsewhere (e.g. to the command palette). */
  function restoreSelection() {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    if (document.activeElement === el && sel.rangeCount && el.contains(sel.anchorNode)) return;
    const r = savedRange.current;
    // Select first, then focus: focusing an editable without a selection inside it would
    // put the caret at the start and overwrite what we restore.
    if (r && el.contains(r.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(r.cloneRange());
    }
    el.focus({ preventScroll: true });
    if (r && el.contains(r.startContainer) && !el.contains(sel.anchorNode)) {
      sel.removeAllRanges();
      sel.addRange(r.cloneRange());
    }
  }

  const api: EditorApi = {
    splitAtCursor() {
      restoreSelection();
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return null;
      flush();
      const caret = sel.getRangeAt(0);
      const tail = document.createRange();
      tail.setStart(caret.startContainer, caret.startOffset);
      tail.setEnd(el, el.childNodes.length);
      const afterFrag = tail.cloneContents();
      const head = document.createRange();
      head.setStart(el, 0);
      head.setEnd(caret.startContainer, caret.startOffset);
      const beforeFrag = head.cloneContents();
      return { before: fragmentToMarkdown(beforeFrag), after: fragmentToMarkdown(afterFrag) };
    },
    insertBreak() {
      restoreSelection();
      insertBreakAt(currentBlock());
    },
    remember() {
      remember();
    },
    focus(atEnd = false) {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (atEnd && el.lastElementChild) placeCaret(el.lastElementChild as HTMLElement, true);
    },
  };

  const editor = (
    <div
      ref={ref}
      className={`prose ${props.className ?? ''}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      aria-label="Manuscript text"
      data-placeholder={props.placeholder ?? 'Begin…'}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onKeyUp={() => remember()}
      onPointerUp={() => remember()}
      onPaste={onPaste}
      onFocus={() => {
        activeEditor.current = api;
        remember();
        document.execCommand('defaultParagraphSeparator', false, 'p');
      }}
      onBlur={() => {
        flush();
        setMention(null);
        lastCurrentRef.current?.classList.remove('is-current');
        lastCurrentRef.current = null;
      }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (!a) return;
        e.preventDefault();
        const id = a.getAttribute('data-ink');
        if (id && (e.metaKey || e.ctrlKey)) propsRef.current.onOpenLink?.(id);
      }}
    />
  );

  return (
    <>
      {editor}
      {mention && mentionItems.length > 0 && (
        <div
          className="mention-menu"
          role="listbox"
          aria-label="Link to"
          style={{ left: Math.min(mention.x, window.innerWidth - 300), top: Math.min(mention.y + 6, window.innerHeight - 320) }}
        >
          {mentionItems.map((it, i) => (
            <div
              key={it.id}
              role="option"
              aria-selected={i === mention.sel}
              className="mention-item"
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => mention.sel !== i && setMention({ ...mention, sel: i })}
              onClick={() => chooseMention(it)}
            >
              {it.icon}
              <span className="pl-title">{it.title}</span>
              {it.sub && <span className="pl-hint">{it.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function placeCaret(el: HTMLElement, atEnd: boolean) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

function atStart(block: HTMLElement, sel: Selection) {
  const r = document.createRange();
  r.setStart(block, 0);
  r.setEnd(sel.anchorNode!, sel.anchorOffset);
  return r.toString().length === 0;
}
