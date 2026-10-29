import { nodeKindOf as kindOf } from './ids';
import type { BinderNode, NodeKind } from './types';

// Pure operations on the binder tree. Every function returns a new tree.

const RANK: Record<NodeKind, number> = { part: 0, chapter: 1, scene: 2 };

export type DropPosition = 'before' | 'after' | 'inside';

export function walk(tree: BinderNode[], fn: (n: BinderNode, parent: BinderNode | null, depth: number) => void) {
  const visit = (nodes: BinderNode[], parent: BinderNode | null, depth: number) => {
    for (const n of nodes) {
      fn(n, parent, depth);
      if (n.children) visit(n.children, n, depth + 1);
    }
  };
  visit(tree, null, 0);
}

export function flatIds(tree: BinderNode[]): string[] {
  const ids: string[] = [];
  walk(tree, (n) => ids.push(n.id));
  return ids;
}

export function findNode(tree: BinderNode[], id: string): BinderNode | null {
  let found: BinderNode | null = null;
  walk(tree, (n) => {
    if (n.id === id) found = n;
  });
  return found;
}

export function parentOf(tree: BinderNode[], id: string): BinderNode | null {
  let found: BinderNode | null = null;
  walk(tree, (n, p) => {
    if (n.id === id) found = p;
  });
  return found;
}

export function isDescendant(tree: BinderNode[], ancestorId: string, id: string): boolean {
  const a = findNode(tree, ancestorId);
  if (!a?.children) return false;
  return flatIds(a.children).includes(id);
}

/** Can a node of kind `child` live directly inside a node of kind `parent` (null = root)? */
export function accepts(parent: NodeKind | null, child: NodeKind): boolean {
  if (parent === null) return true;
  return RANK[parent] < RANK[child];
}

function clone(tree: BinderNode[]): BinderNode[] {
  return tree.map((n) => (n.children ? { id: n.id, children: clone(n.children) } : { id: n.id }));
}

export function removeNode(tree: BinderNode[], id: string): { tree: BinderNode[]; node: BinderNode | null } {
  const t = clone(tree);
  let removed: BinderNode | null = null;
  const strip = (nodes: BinderNode[]): BinderNode[] =>
    nodes.flatMap((n) => {
      if (n.id === id) {
        removed = n;
        return [];
      }
      if (n.children) n.children = strip(n.children);
      return [n];
    });
  return { tree: strip(t), node: removed };
}

export function canDrop(tree: BinderNode[], dragId: string, targetId: string | null, pos: DropPosition): boolean {
  const dragKind = kindOf(dragId);
  if (!dragKind) return false;
  if (targetId === null) return accepts(null, dragKind);
  if (dragId === targetId || isDescendant(tree, dragId, targetId)) return false;
  const targetKind = kindOf(targetId);
  if (!targetKind) return false;
  if (pos === 'inside') return accepts(targetKind, dragKind);
  const parent = parentOf(tree, targetId);
  return accepts(parent ? kindOf(parent.id) : null, dragKind);
}

/** Insert `node` relative to `targetId`. targetId null = append at root. */
export function insertNode(tree: BinderNode[], node: BinderNode, targetId: string | null, pos: DropPosition): BinderNode[] {
  const t = clone(tree);
  if (targetId === null) return [...t, node];
  const place = (nodes: BinderNode[]): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === targetId) {
        if (pos === 'inside') (n.children ??= []).push(node);
        else nodes.splice(pos === 'before' ? i : i + 1, 0, node);
        return true;
      }
      if (n.children && place(n.children)) return true;
    }
    return false;
  };
  if (!place(t)) t.push(node);
  return t;
}

export function moveNode(tree: BinderNode[], dragId: string, targetId: string | null, pos: DropPosition): BinderNode[] {
  if (!canDrop(tree, dragId, targetId, pos)) return tree;
  const { tree: without, node } = removeNode(tree, dragId);
  if (!node) return tree;
  return insertNode(without, node, targetId, pos);
}

/** Scenes in reading order. */
export function sceneOrder(tree: BinderNode[]): string[] {
  return flatIds(tree).filter((id) => kindOf(id) === 'scene');
}

/** Scene ids under a node (or the node itself if it is a scene). */
export function scenesUnder(tree: BinderNode[], id: string): string[] {
  const n = findNode(tree, id);
  if (!n) return [];
  if (kindOf(id) === 'scene') return [id];
  return n.children ? sceneOrder(n.children) : [];
}

/** Where a new node of `kind` should go, given the current selection. */
export function placementFor(tree: BinderNode[], kind: NodeKind, selectedId: string | null): { targetId: string | null; pos: DropPosition } {
  if (!selectedId || !findNode(tree, selectedId)) return { targetId: null, pos: 'inside' };
  const selKind = kindOf(selectedId)!;
  if (accepts(selKind, kind)) return { targetId: selectedId, pos: 'inside' };
  // Walk up until we find a node whose parent accepts the new kind, then insert after it.
  let cur: string | null = selectedId;
  while (cur) {
    const p = parentOf(tree, cur);
    if (accepts(p ? kindOf(p.id) : null, kind)) return { targetId: cur, pos: 'after' };
    cur = p?.id ?? null;
  }
  return { targetId: null, pos: 'inside' };
}
