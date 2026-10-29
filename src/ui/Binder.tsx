import { useEffect, useRef, useState } from 'react';
import { canDrop, flatIds, type DropPosition } from '../model/binder';
import { nodeKindOf as kindOf } from '../model/ids';
import type { BinderNode, DocKind, NodeKind, Status } from '../model/types';
import { formatCount } from '../model/words';
import { store, useStore } from '../store/store';
import { SubplotStripes } from './plan/shared';
import { IconChapter, IconChevron, IconNewChapter, IconNewScene, IconPart, IconPlus, IconRename, IconScene, IconTrash } from './icons';

const KIND_ICON = { part: IconPart, chapter: IconChapter, scene: IconScene };
const EMPTY: BinderNode[] = [];
const KIND_LABEL: Record<DocKind, string> = { part: 'part', chapter: 'chapter', scene: 'scene', character: 'character', world: 'entry', subplot: 'subplot', map: 'map', event: 'event', submission: 'submission', market: 'market', idea: 'idea' };

interface DragState {
  id: string;
  over: string | null;
  pos: DropPosition | null;
}

export function confirmDelete(id: string) {
  const p = store.get().project;
  const doc = p?.docs[id];
  if (!p || !doc) return;
  const kind = KIND_LABEL[doc.kind];
  const childCount = (() => {
    let n = 0;
    const visit = (nodes: BinderNode[]): boolean =>
      nodes.some((x) => {
        if (x.id === id) {
          n = x.children ? flatIds(x.children).length : 0;
          return true;
        }
        return x.children ? visit(x.children) : false;
      });
    visit(p.meta.binder);
    return n;
  })();
  void store
    .ask({
      title: `Move “${doc.title || 'Untitled'}” to the trash?`,
      body: `${childCount ? `This ${kind} and the ${childCount} item${childCount > 1 ? 's' : ''} inside it` : `This ${kind}`} will move to the .inkwell/trash folder inside the project, where you can restore the files.`,
      action: 'Move to trash',
      danger: true,
    })
    .then((ok) => ok && store.remove(id));
}

export function Binder() {
  const binder = useStore((s) => s.project?.meta.binder ?? EMPTY);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visibleIds = (): string[] => {
    const out: string[] = [];
    const visit = (nodes: BinderNode[]) =>
      nodes.forEach((n) => {
        out.push(n.id);
        if (n.children?.length && store.isExpanded(n.id)) visit(n.children);
      });
    visit(store.get().project?.meta.binder ?? []);
    return out;
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const s = store.get();
    if (s.renamingId) return;
    const ids = visibleIds();
    const i = s.selectedId ? ids.indexOf(s.selectedId) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        store.select(next);
        listRef.current?.querySelector<HTMLElement>(`[data-id="${next}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowRight' && s.selectedId) {
      store.toggleExpanded(s.selectedId, true);
    } else if (e.key === 'ArrowLeft' && s.selectedId) {
      store.toggleExpanded(s.selectedId, false);
    } else if (e.key === 'F2' && s.selectedId) {
      e.preventDefault();
      store.setRenaming(s.selectedId);
    } else if ((e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) && s.selectedId) {
      e.preventDefault();
      confirmDelete(s.selectedId);
    }
  }

  function dropAt(e: React.DragEvent, id: string, kind: NodeKind) {
    if (!drag) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    const tree = store.get().project!.meta.binder;
    // Containers take drops in their middle; everything takes before/after on the edges.
    let pos: DropPosition = y < 0.5 ? 'before' : 'after';
    if (kind !== 'scene' && y > 0.25 && y < 0.75 && canDrop(tree, drag.id, id, 'inside')) pos = 'inside';
    else if (!canDrop(tree, drag.id, id, pos) && canDrop(tree, drag.id, id, 'inside')) pos = 'inside';
    const ok = canDrop(tree, drag.id, id, pos);
    e.dataTransfer.dropEffect = ok ? 'move' : 'none';
    if (ok) e.preventDefault();
    if (drag.over !== id || drag.pos !== (ok ? pos : null)) setDrag({ ...drag, over: id, pos: ok ? pos : null });
  }

  const renderNodes = (nodes: BinderNode[], depth: number) =>
    nodes.map((n) => (
      <BinderRow key={n.id} node={n} depth={depth} drag={drag} setDrag={setDrag} dropAt={dropAt} openMenu={(x, y) => setMenu({ id: n.id, x, y })}>
        {n.children?.length ? renderNodes(n.children, depth + 1) : null}
      </BinderRow>
    ));

  return (
    <>
      <div
        className="binder"
        ref={listRef}
        role="tree"
        aria-label="Manuscript"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          // Dropping on empty space below the tree appends at the root.
          if (drag && e.target === e.currentTarget && canDrop(store.get().project!.meta.binder, drag.id, null, 'inside')) {
            e.preventDefault();
            if (drag.over !== null) setDrag({ ...drag, over: null, pos: 'inside' });
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag?.pos) store.move(drag.id, drag.over, drag.pos);
          setDrag(null);
        }}
      >
        {binder.length ? renderNodes(binder, 0) : <div className="binder-empty">Nothing here yet. Add a chapter or a scene to begin.</div>}
      </div>
      {menu && <RowMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}

function BinderRow(props: {
  node: BinderNode;
  depth: number;
  drag: DragState | null;
  setDrag(d: DragState | null): void;
  dropAt(e: React.DragEvent, id: string, kind: NodeKind): void;
  openMenu(x: number, y: number): void;
  children: React.ReactNode;
}) {
  const { node, depth, drag } = props;
  const id = node.id;
  const kind = kindOf(id) ?? 'scene';
  const doc = useStore((s) => s.project?.docs[id]);
  const selected = useStore((s) => s.selectedId === id);
  const renaming = useStore((s) => s.renamingId === id);
  const expanded = useStore((s) => s.expanded[id] ?? true);
  const words = useStore((s) => {
    if (kind === 'scene') return s.counts[id] ?? 0;
    const all = node.children ? flatIds(node.children) : [];
    return all.reduce((a, x) => a + (s.counts[x] ?? 0), 0);
  });
  const Icon = KIND_ICON[kind];
  const hasKids = !!node.children?.length;
  const status = (doc?.fields.status as Status) ?? 'draft';
  const target = Number(doc?.fields.target) || 0;
  const indent = 8 + depth * 16;
  const dropCls = drag?.over === id && drag.pos ? `drop-${drag.pos}` : '';

  return (
    <div role="treeitem" aria-expanded={hasKids ? expanded : undefined} aria-selected={selected}>
      <div
        data-id={id}
        className={`brow ${kind} ${selected ? 'selected' : ''} ${drag?.id === id ? 'dragging' : ''} ${dropCls}`}
        style={{ paddingLeft: indent, ['--indent' as string]: `${indent + 24}px` }}
        draggable={!renaming}
        onClick={() => store.select(id)}
        onDoubleClick={() => store.setRenaming(id)}
        onContextMenu={(e) => {
          e.preventDefault();
          store.select(id);
          props.openMenu(e.clientX, e.clientY);
        }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', doc?.title ?? id);
          props.setDrag({ id, over: null, pos: null });
        }}
        onDragEnd={() => props.setDrag(null)}
        onDragOver={(e) => props.dropAt(e, id, kind)}
        onDragLeave={(e) => {
          if (drag?.over === id && !e.currentTarget.contains(e.relatedTarget as Node)) props.setDrag({ ...drag, over: null, pos: null });
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (drag?.pos && drag.over === id) store.move(drag.id, id, drag.pos);
          props.setDrag(null);
        }}
      >
        <button
          className={`twisty ${expanded ? 'open' : ''} ${hasKids ? '' : 'empty'}`}
          tabIndex={-1}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            store.toggleExpanded(id);
          }}
        >
          <IconChevron />
        </button>
        {kind === 'scene' ? <span className={`status-dot ${status}`} title={status} /> : <Icon className="kind" />}
        {renaming ? (
          <RenameInput id={id} initial={doc?.title ?? ''} />
        ) : (
          <span className={`btitle ${doc?.title ? '' : 'placeholder'}`}>{doc?.title || 'Untitled'}</span>
        )}
        {!renaming && kind === 'scene' && doc && <SubplotStripes scene={doc} />}
        {!renaming && words > 0 && <span className="bcount">{formatCount(words)}</span>}
        {kind === 'scene' && target > 0 && (
          <span className="rule" aria-hidden="true" style={{ ['--fill' as string]: `${Math.min(100, (words / target) * 100)}%`, ['--rule-color' as string]: `var(--st-${status})` }}>
            <i />
          </span>
        )}
      </div>
      {hasKids && expanded && <div role="group">{props.children}</div>}
    </div>
  );
}

function RenameInput({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (value.trim() !== initial) store.updateDoc(id, { title: value.trim() }, { external: false });
    store.setRenaming(null);
  };
  return (
    <input
      ref={ref}
      className="rename"
      value={value}
      aria-label="Title"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') store.setRenaming(null);
      }}
    />
  );
}

function RowMenu({ id, x, y, onClose }: { id: string; x: number; y: number; onClose(): void }) {
  const kind = kindOf(id)!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const top = Math.min(y, window.innerHeight - 220);
  return (
    <div className="menu" ref={ref} style={{ left: x, top }} role="menu">
      <button role="menuitem" onClick={act(() => store.setRenaming(id))}>
        <IconRename /> Rename
      </button>
      {kind !== 'scene' && (
        <button role="menuitem" onClick={act(() => store.addNode('scene', { targetId: id, pos: 'inside' }))}>
          <IconNewScene /> New scene inside
        </button>
      )}
      {kind === 'part' && (
        <button role="menuitem" onClick={act(() => store.addNode('chapter', { targetId: id, pos: 'inside' }))}>
          <IconNewChapter /> New chapter inside
        </button>
      )}
      <button role="menuitem" onClick={act(() => store.addNode(kind, { targetId: id, pos: 'after' }))}>
        <IconPlus /> New {KIND_LABEL[kind]} after
      </button>
      <div className="sep" />
      <button role="menuitem" className="danger" onClick={act(() => confirmDelete(id))}>
        <IconTrash /> Move to trash
      </button>
    </div>
  );
}
