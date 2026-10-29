import { customAlphabet } from 'nanoid';
import type { DocKind, NodeKind } from './types';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export const PREFIX: Record<DocKind, string> = { part: 'pt', chapter: 'ch', scene: 'sc', character: 'cr', world: 'wl', subplot: 'sp', map: 'mp', event: 'ev', submission: 'sb', market: 'mk', idea: 'id' };
const KIND_BY_PREFIX: Record<string, DocKind> = { pt: 'part', ch: 'chapter', sc: 'scene', cr: 'character', wl: 'world', sp: 'subplot', mp: 'map', ev: 'event', sb: 'submission', mk: 'market', id: 'idea' };

export function newId(kind: DocKind): string {
  return `${PREFIX[kind]}_${nano()}`;
}

export function kindOf(id: string): DocKind | null {
  return KIND_BY_PREFIX[id.slice(0, 2)] ?? null;
}

/** Kind for manuscript (binder) ids only. */
export function nodeKindOf(id: string): NodeKind | null {
  const k = kindOf(id);
  return k === 'part' || k === 'chapter' || k === 'scene' ? k : null;
}

export function isEntityId(id: string | null | undefined): boolean {
  const k = id ? kindOf(id) : null;
  return k === 'character' || k === 'world' || k === 'subplot' || k === 'map' || k === 'event' || k === 'submission' || k === 'market' || k === 'idea';
}

export const ID_RE = /^[a-z]{2}_[0-9a-z]{4,32}$/;
