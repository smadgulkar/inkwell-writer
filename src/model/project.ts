import type { FsAdapter } from '../fs/adapter';
import { join } from '../fs/adapter';
import { flatIds, insertNode } from './binder';
import { parseFrontmatter, stringifyFrontmatter, toYaml, fromYaml } from './frontmatter';
import { ID_RE, kindOf, newId } from './ids';
import type { BinderNode, Doc, DocKind, Mode, ProjectMeta } from './types';

export const META_FILE = 'project.yaml';
export const MANUSCRIPT_DIR = 'manuscript';
export const CHARACTERS_DIR = 'characters';
export const WORLD_DIR = 'world';
export const SUBPLOTS_DIR = 'subplots';
export const MAPS_DIR = 'maps';
export const TIMELINE_DIR = 'timeline';
export const SUBMISSIONS_DIR = 'submissions';
export const IDEAS_DIR = 'ideas';
export const SNAPSHOT_DIR = '.inkwell/snapshots';
export const STATS_FILE = '.inkwell/stats.json';
export const ASSETS_DIR = 'assets';
const DOC_DIRS = [MANUSCRIPT_DIR, CHARACTERS_DIR, WORLD_DIR, SUBPLOTS_DIR, MAPS_DIR, TIMELINE_DIR, SUBMISSIONS_DIR, IDEAS_DIR];
export const TRASH_DIR = '.inkwell/trash';

export interface LoadedProject {
  meta: ProjectMeta;
  docs: Record<string, Doc>;
  /** Exact text last read from or written to disk, per path. Used to skip no-op writes. */
  disk: Record<string, string>;
  warnings: string[];
  /** Extra copies of a document left by a sync service (Dropbox, Drive, OneDrive, Syncthing). */
  conflicts: ConflictCopy[];
}

export interface ConflictCopy {
  id: string;
  /** File holding the other version, or null when it only exists in memory (an edit that raced a sync). */
  path: string | null;
  doc: Doc;
  /** Human description of where it came from, e.g. "Jane’s conflicted copy". */
  label: string;
}

const STEM_ID = /^([a-z]{2}_[0-9a-z]{4,32})(.*)$/;

/** How a sync service named this copy, in plain words. */
export function conflictLabel(rest: string): string {
  const r = rest.replace(/\.md$/, '').trim();
  const dropbox = /\((.+?)['’]s conflicted copy/i.exec(r);
  if (dropbox) return `${dropbox[1]}’s conflicted copy`;
  if (/conflicted copy/i.test(r)) return 'A conflicted copy';
  if (/sync-conflict/i.test(r)) return 'A Syncthing conflict copy';
  const host = /^-([A-Za-z0-9][\w-]*)$/.exec(r);
  if (host) return `A copy from ${host[1]}`;
  if (/^\s*\(\d+\)$/.test(r) || /^ ?copy/i.test(r)) return 'A duplicate copy';
  return 'Another copy';
}

export function dirFor(id: string) {
  const k = kindOf(id);
  return k === 'character' ? CHARACTERS_DIR : k === 'world' ? WORLD_DIR : k === 'subplot' ? SUBPLOTS_DIR : k === 'map' ? MAPS_DIR : k === 'event' ? TIMELINE_DIR : k === 'submission' || k === 'market' ? SUBMISSIONS_DIR : k === 'idea' ? IDEAS_DIR : MANUSCRIPT_DIR;
}

export function docPath(id: string) {
  return join(dirFor(id), `${id}.md`);
}

// Frontmatter key order for readable files.
const HEAD_KEYS = ['id', 'type', 'title'];

export function serializeDoc(doc: Doc): string {
  const data: Record<string, unknown> = { id: doc.id, type: doc.kind, title: doc.title };
  for (const [k, v] of Object.entries(doc.fields)) if (!HEAD_KEYS.includes(k)) data[k] = v;
  return stringifyFrontmatter(data, doc.body);
}

export function parseDoc(text: string, fallbackId?: string): Doc {
  const { data, body } = parseFrontmatter(text);
  const id = typeof data.id === 'string' && ID_RE.test(data.id) ? data.id : fallbackId;
  if (!id) throw new Error('Missing id');
  const kind = (kindOf(id) ?? (data.type as DocKind)) || 'scene';
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!HEAD_KEYS.includes(k)) fields[k] = v;
  return { id, kind, title: typeof data.title === 'string' ? data.title : String(data.title ?? ''), body: body.replace(/\s+$/, ''), fields };
}

export function serializeMeta(meta: ProjectMeta): string {
  const { format, title, author, mode, goals, binder, ...rest } = meta;
  return toYaml({ format, title, author, mode, goals, ...rest, binder });
}

export function parseMeta(text: string): ProjectMeta {
  const raw = (fromYaml<Partial<ProjectMeta>>(text) ?? {}) as Partial<ProjectMeta>;
  const sanitize = (nodes: unknown): BinderNode[] =>
    Array.isArray(nodes)
      ? nodes
          .filter((n): n is { id: string; children?: unknown } => !!n && typeof (n as BinderNode).id === 'string')
          .map((n) => (n.children ? { id: n.id, children: sanitize(n.children) } : { id: n.id }))
      : [];
  return {
    ...raw,
    format: 1,
    title: raw.title || 'Untitled',
    mode: raw.mode === 'short' ? 'short' : 'novel',
    binder: sanitize(raw.binder),
  } as ProjectMeta;
}

export async function loadProject(fs: FsAdapter): Promise<LoadedProject> {
  const metaText = await fs.read(META_FILE);
  if (metaText === null) throw new Error('This folder is not an Inkwell project (no project.yaml).');
  const meta = parseMeta(metaText);
  const disk: Record<string, string> = { [META_FILE]: metaText };
  const docs: Record<string, Doc> = {};
  const warnings: string[] = [];

  const conflicts: ConflictCopy[] = [];
  for (const dir of DOC_DIRS) {
    const names = (await fs.list(dir)).filter((n) => n.endsWith('.md'));
    // Canonical "<id>.md" files first, so a sync copy never shadows the real document.
    const canonical = (n: string) => /^[a-z]{2}_[0-9a-z]{4,32}\.md$/.test(n);
    names.sort((a, b) => Number(canonical(b)) - Number(canonical(a)) || a.localeCompare(b));
    const texts = await Promise.all(names.map((n) => fs.read(join(dir, n))));
    names.forEach((name, i) => {
      const text = texts[i];
      if (text === null) return;
      try {
        const stem = STEM_ID.exec(name.replace(/\.md$/, ''));
        const doc = parseDoc(text, stem ? stem[1] : name.replace(/\.md$/, ''));
        if (dirFor(doc.id) !== dir) {
          warnings.push(`Skipped ${dir}/${name}: its id belongs in ${dirFor(doc.id)}/.`);
          return;
        }
        const isCanonical = name === `${doc.id}.md`;
        if (docs[doc.id]) {
          conflicts.push({ id: doc.id, path: join(dir, name), doc, label: conflictLabel(stem && stem[1] === doc.id ? stem[2] : name) });
          return;
        }
        docs[doc.id] = doc;
        // A recovered copy with no canonical file: empty disk text makes the next save write "<id>.md".
        disk[docPath(doc.id)] = isCanonical ? text : '';
        if (!isCanonical) warnings.push(`Recovered “${doc.title || doc.id}” from ${dir}/${name}.`);
      } catch (e) {
        warnings.push(`Skipped ${dir}/${name}: ${(e as Error).message}`);
      }
    });
  }

  // Reconcile binder with files: drop ids without files, append files missing from the binder.
  const prune = (nodes: BinderNode[]): BinderNode[] =>
    nodes.flatMap((n) => {
      if (!docs[n.id]) {
        warnings.push(`Binder entry ${n.id} has no file; removed from the binder.`);
        return n.children ? prune(n.children) : [];
      }
      return [n.children ? { id: n.id, children: prune(n.children) } : { id: n.id }];
    });
  let binder = prune(meta.binder);
  const listed = new Set(flatIds(binder));
  for (const id of Object.keys(docs)) {
    if (dirFor(id) !== MANUSCRIPT_DIR) continue;
    if (!listed.has(id)) {
      binder = insertNode(binder, { id }, null, 'inside');
      warnings.push(`Found ${docs[id].title || id} outside the binder; added it at the end.`);
    }
  }
  meta.binder = binder;
  return { meta, docs, disk, warnings, conflicts };
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

export function makeDoc(kind: DocKind, title: string, body = '', fields: Record<string, unknown> = {}): Doc {
  const f: Record<string, unknown> = { ...fields };
  if (kind === 'scene') {
    f.status ??= 'draft';
    f.created ??= nowIso();
  }
  return { id: newId(kind), kind, title, body, fields: f };
}

/** Files for a brand-new project. */
export function newProjectFiles(title: string, mode: Mode, author?: string): Record<string, string> {
  const files: Record<string, string> = {};
  const binder: BinderNode[] = [];
  if (mode === 'short') {
    const scene = makeDoc('scene', title);
    files[docPath(scene.id)] = serializeDoc(scene);
    binder.push({ id: scene.id });
  } else {
    const ch = makeDoc('chapter', 'Chapter One');
    const sc = makeDoc('scene', 'Opening');
    files[docPath(ch.id)] = serializeDoc(ch);
    files[docPath(sc.id)] = serializeDoc(sc);
    binder.push({ id: ch.id, children: [{ id: sc.id }] });
  }
  const meta: ProjectMeta = {
    format: 1,
    title,
    author,
    mode,
    goals: mode === 'short' ? { project: 5000, daily: 500 } : { project: 90000, daily: 1000 },
    binder,
  };
  files[META_FILE] = serializeMeta(meta);
  return files;
}
