import { useSyncExternalStore } from 'react';
import type { FsAdapter } from '../fs/adapter';
import { join } from '../fs/adapter';
import { isEntityId, kindOf } from '../model/ids';
import { buildMentionIndex, type MentionIndex } from '../model/mentions';
import { newCharacterFields, newWorldFields } from '../model/entities';
import { beatPatch, sceneSubplots, subplotColorOf, SUBPLOT_COLORS, toggleSubplotPatch } from '../model/subplots';
import { findNode, flatIds, insertNode, moveNode, placementFor, removeNode, sceneOrder, type DropPosition } from '../model/binder';
import { dirFor, docPath, loadProject, makeDoc, type ConflictCopy, META_FILE, nowIso, parseDoc, serializeDoc, serializeMeta, SNAPSHOT_DIR, STATS_FILE, TRASH_DIR } from '../model/project';
import type { Doc, Mode, NodeKind, ProjectMeta, WorldKind } from '../model/types';
import { countMarkdown } from '../model/words';
import { touchLocalProject } from '../fs/local';
import { detectLinks, guessType, ideaOf, ideaTitle, type IdeaType } from '../model/ideas';
import { markdownToText } from '../model/markdown';

export type Theme = 'system' | 'light' | 'paper' | 'dusk' | 'night';
export type ProseFont = 'literata' | 'newsreader' | 'source' | 'garamond' | 'sans' | 'typewriter';
export const PROSE_FONTS: ProseFont[] = ['literata', 'newsreader', 'source', 'garamond', 'sans', 'typewriter'];
const THEMES: Theme[] = ['system', 'light', 'paper', 'dusk', 'night'];
export type Section = 'write' | 'plan' | 'characters' | 'world' | 'maps' | 'timeline' | 'submissions' | 'ideas' | 'search';
export type PlanView = 'corkboard' | 'outline' | 'grid' | 'manuscript' | 'progress';

export function sectionOf(id: string | null): Section {
  const k = id ? kindOf(id) : null;
  return k === 'character' ? 'characters' : k === 'world' ? 'world' : k === 'subplot' ? 'plan' : k === 'map' ? 'maps' : k === 'event' ? 'timeline' : k === 'submission' || k === 'market' ? 'submissions' : k === 'idea' ? 'ideas' : 'write';
}

export interface UiPrefs {
  theme: Theme;
  sidebar: boolean;
  inspector: boolean;
  focus: boolean;
  typewriter: boolean;
  proseSize: number; // px
  measure: number; // characters per line
  proseFont: ProseFont;
  planView: PlanView;
  /** Theme system version; 2 = the warm themes (Study default). */
  themeVersion?: number;
}

export interface OpenProject {
  meta: ProjectMeta;
  docs: Record<string, Doc>;
  fs: FsAdapter;
  /** localStorage key for browser-stored projects. */
  localKey?: string;
  warnings: string[];
}

/** Words per day, kept in .inkwell/stats.json so it follows the project between devices. */
export interface Stats {
  days: Record<string, { start: number; end: number }>;
}

export interface SnapshotInfo {
  file: string;
  taken: Date;
  name?: string;
  reason?: string;
  title: string;
  body: string;
  words: number;
}

export interface TrashItem {
  file: string;
  id: string;
  kind: string;
  title: string;
}

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let lastSnapshotMs = 0;
function snapshotFileName(d: Date) {
  // Millisecond precision, and never the same name twice in one session.
  const ms = Math.max(d.getTime(), lastSnapshotMs + 1);
  lastSnapshotMs = ms;
  return new Date(ms).toISOString().replace(/:/g, '-').replace('.', '-') + '.md';
}

function snapshotDate(file: string) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z/.exec(file);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5] ?? '000'}Z`) : new Date(0);
}

export interface ConfirmRequest {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  resolve(ok: boolean): void;
}

export interface State {
  project: OpenProject | null;
  selectedId: string | null;
  section: Section;
  /** Last selection per section, so switching sections returns to where you were. */
  lastIn: Partial<Record<Section, string | null>>;
  history: { back: string[]; forward: string[] };
  searchQuery: string;
  /** A pin to center on when a map opens (from "Show on map"). */
  focusPin: { map: string; pin: string } | null;
  /** Bumped when a doc changes from outside the editor, so the editor reloads it. */
  externalRev: number;
  save: 'saved' | 'pending' | 'saving' | 'error';
  saveError?: string;
  counts: Record<string, number>;
  todayStart: number;
  sessionStart: number;
  stats: Stats;
  /** Bumped whenever snapshots or the trash change, so lists refresh. */
  historyRev: number;
  expanded: Record<string, boolean>;
  renamingId: string | null;
  palette: boolean;
  settings: boolean;
  trashOpen: boolean;
  conflicts: ConflictCopy[];
  conflictsOpen: boolean;
  exportOpen: boolean;
  captureOpen: boolean;
  /** A character, place or scene the idea being jotted is about. */
  captureFor: string | null;
  ui: UiPrefs;
  toast: { text: string; id: number } | null;
  selectionWords: number;
  confirm: ConfirmRequest | null;
}

const UI_KEY = 'inkwell:ui';
const DEFAULT_UI: UiPrefs = {
  theme: 'paper',
  themeVersion: 2,
  sidebar: true,
  inspector: true,
  focus: false,
  typewriter: false,
  proseSize: 19,
  measure: 68,
  proseFont: 'literata',
  planView: 'corkboard',
};

function loadUi(): UiPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(UI_KEY) || '{}') as Partial<UiPrefs> & { theme?: string };
    const saved = { ...DEFAULT_UI, ...raw } as UiPrefs & { theme: string };
    // The warm themes replaced the old ones; everyone starts again on Study once, then chooses freely.
    if (raw.themeVersion !== 2) {
      saved.theme = 'paper';
      saved.themeVersion = 2;
    }
    // Earlier versions called the dark theme "dark".
    if (saved.theme === 'dark') saved.theme = 'dusk';
    if (!THEMES.includes(saved.theme as Theme)) saved.theme = 'system';
    if (!PROSE_FONTS.includes(saved.proseFont)) saved.proseFont = 'literata';
    return saved as UiPrefs;
  } catch {
    return { ...DEFAULT_UI };
  }
}

const SAVE_DELAY = 600;

class Store {
  state: State = {
    project: null,
    selectedId: null,
    section: 'write',
    lastIn: {},
    history: { back: [], forward: [] },
    searchQuery: '',
    focusPin: null,
    externalRev: 0,
    save: 'saved',
    counts: {},
    todayStart: 0,
    sessionStart: 0,
    stats: { days: {} },
    historyRev: 0,
    expanded: {},
    renamingId: null,
    palette: false,
    settings: false,
    trashOpen: false,
    conflicts: [],
    conflictsOpen: false,
    exportOpen: false,
    captureOpen: false,
    captureFor: null,
    ui: loadUi(),
    toast: null,
    selectionWords: 0,
    confirm: null,
  };
  private listeners = new Set<() => void>();
  /** Hook for the UI to save editor state (the caret) before an overlay takes focus. */
  beforeOverlay: (() => void) | null = null;
  /** Called after a project opens and whenever its title or mode changes. */
  onOpened: ((p: OpenProject) => void) | null = null;
  private disk: Record<string, string> = {};
  private dirtyDocs = new Set<string>();
  private metaDirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---------- UI ----------

  setUi(patch: Partial<UiPrefs>) {
    const ui = { ...this.state.ui, ...patch };
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(ui));
    } catch {
      /* ignore */
    }
    this.set({ ui });
  }
  setPalette(open: boolean) {
    if (open) this.beforeOverlay?.();
    this.set({ palette: open, settings: open ? false : this.state.settings });
  }
  setTrash(open: boolean) {
    this.set({ trashOpen: open, palette: false, settings: false });
  }
  setExport(open: boolean) {
    this.set({ exportOpen: open, palette: false, settings: false });
  }

  setSettings(open: boolean) {
    this.set({ settings: open, palette: open ? false : this.state.palette });
  }
  toast(text: string) {
    const id = Date.now();
    this.set({ toast: { text, id } });
    setTimeout(() => this.state.toast?.id === id && this.set({ toast: null }), 3200);
  }
  toggleExpanded(id: string, open?: boolean) {
    this.set({ expanded: { ...this.state.expanded, [id]: open ?? !this.isExpanded(id) } });
  }
  isExpanded(id: string) {
    return this.state.expanded[id] ?? true;
  }
  /** In-app confirmation dialog (browser confirm() is unavailable in some hosts and looks out of place). */
  ask(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    this.state.confirm?.resolve(false);
    return new Promise((resolve) =>
      this.set({
        confirm: {
          ...req,
          resolve: (ok) => {
            this.set({ confirm: null });
            resolve(ok);
          },
        },
      }),
    );
  }
  setSelectionWords(n: number) {
    if (n !== this.state.selectionWords) this.set({ selectionWords: n });
  }
  setRenaming(id: string | null) {
    this.set({ renamingId: id });
  }

  // ---------- project lifecycle ----------

  async open(fs: FsAdapter, localKey?: string) {
    await this.close();
    const loaded = await loadProject(fs);
    this.disk = loaded.disk;
    const counts: Record<string, number> = {};
    for (const d of Object.values(loaded.docs)) counts[d.id] = d.kind === 'scene' ? countMarkdown(d.body) : 0;
    const project: OpenProject = { meta: loaded.meta, docs: loaded.docs, fs, localKey, warnings: loaded.warnings };
    const first = sceneOrder(loaded.meta.binder)[0] ?? flatIds(loaded.meta.binder)[0] ?? null;
    let lastSelected: string | null = null;
    try {
      lastSelected = localStorage.getItem(this.recentKey(project));
    } catch {
      /* ignore */
    }
    const selectedId = lastSelected && loaded.docs[lastSelected] ? lastSelected : first;
    const section = sectionOf(selectedId);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    this.set({
      project,
      selectedId,
      section,
      lastIn: { [section]: selectedId },
      history: { back: [], forward: [] },
      counts,
      todayStart: total,
      sessionStart: total,
      stats: { days: {} },
      expanded: {},
      save: 'saved',
      saveError: undefined,
      externalRev: this.state.externalRev + 1,
      conflicts: [],
    });
    await this.adoptConflicts(loaded.conflicts);
    // If reconciliation changed the binder, write it back.
    if (serializeMeta(loaded.meta) !== loaded.disk[META_FILE]) this.markMeta();
    if (loaded.warnings.length) this.toast(loaded.warnings[0] + (loaded.warnings.length > 1 ? ` (+${loaded.warnings.length - 1} more)` : ''));
    this.touch();
    this.onOpened?.(project);
    await this.loadStats(total);
  }

  async close() {
    await this.flush();
    this.set({ project: null, selectedId: null, counts: {}, lastIn: {}, history: { back: [], forward: [] }, conflicts: [], conflictsOpen: false });
  }

  private recentKey(p: OpenProject) {
    return `inkwell:last:${p.localKey ?? p.fs.label}`;
  }

  private touch() {
    const p = this.state.project;
    if (p?.localKey) touchLocalProject({ key: p.localKey, title: p.meta.title, mode: p.meta.mode, updated: nowIso() });
  }

  // ---------- daily words ----------

  private statsDirty = false;

  private async loadStats(total: number) {
    const p = this.state.project;
    if (!p) return;
    let stats: Stats = { days: {} };
    try {
      const text = await p.fs.read(STATS_FILE);
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.days === 'object') stats = { days: parsed.days };
      }
    } catch {
      /* a damaged stats file only costs the history */
    }
    const today = dayKey();
    if (!stats.days[today]) {
      stats.days[today] = { start: total, end: total };
      this.statsDirty = true;
    }
    this.set({ stats, todayStart: stats.days[today].start });
  }

  /** Record today's total, starting a new day if midnight has passed. */
  private trackWords() {
    const total = this.totalWords();
    const today = dayKey();
    const days = { ...this.state.stats.days };
    const cur = days[today];
    if (!cur) {
      days[today] = { start: total, end: total };
    } else if (cur.end === total) return;
    else days[today] = { ...cur, end: total };
    this.statsDirty = true;
    this.set({ stats: { days }, todayStart: days[today].start });
  }

  totalWords() {
    return Object.values(this.state.counts).reduce((a, b) => a + b, 0);
  }

  // ---------- selection ----------

  select(id: string | null, opts: { history?: boolean } = {}) {
    const p = this.state.project;
    const prev = this.state.selectedId;
    const section = id ? sectionOf(id) : this.state.section === 'search' ? 'write' : this.state.section;
    let history = this.state.history;
    if (opts.history !== false && prev && prev !== id) history = { back: [...history.back, prev].slice(-100), forward: [] };
    this.set({ selectedId: id, renamingId: null, section, lastIn: { ...this.state.lastIn, [section]: id }, history });
    if (p && id) {
      try {
        localStorage.setItem(this.recentKey(p), id);
      } catch {
        /* ignore */
      }
    }
  }

  /** Switch the main area between writing, characters, world and search. */
  setSection(section: Section) {
    if (section === 'search') {
      this.set({ section });
      return;
    }
    const p = this.state.project;
    // Asking for the section you're already in goes back to its overview.
    if (section === this.state.section && section !== 'write' && this.state.selectedId) {
      this.showOverview(section as Exclude<Section, 'write' | 'search'>);
      return;
    }
    let id = this.state.lastIn[section];
    if (id && !p?.docs[id]) id = null;
    if (!id && section === 'write' && p) id = sceneOrder(p.meta.binder)[0] ?? flatIds(p.meta.binder)[0] ?? null;
    if (id) this.select(id);
    else this.set({ section, selectedId: null, lastIn: { ...this.state.lastIn, [section]: null } });
  }

  /** Show a section's overview (no item selected). */
  showOverview(section: Exclude<Section, 'write' | 'search'>) {
    const prev = this.state.selectedId;
    const history = prev ? { back: [...this.state.history.back, prev].slice(-100), forward: [] } : this.state.history;
    this.set({ section, selectedId: null, lastIn: { ...this.state.lastIn, [section]: null }, history });
  }

  back() {
    const { back, forward } = this.state.history;
    const p = this.state.project;
    const stack = [...back];
    while (stack.length) {
      const id = stack.pop()!;
      if (p?.docs[id]) {
        const cur = this.state.selectedId;
        this.set({ history: { back: stack, forward: cur ? [...forward, cur] : forward } });
        this.select(id, { history: false });
        return;
      }
    }
  }

  forward() {
    const { back, forward } = this.state.history;
    const p = this.state.project;
    const stack = [...forward];
    while (stack.length) {
      const id = stack.pop()!;
      if (p?.docs[id]) {
        const cur = this.state.selectedId;
        this.set({ history: { back: cur ? [...back, cur] : back, forward: stack } });
        this.select(id, { history: false });
        return;
      }
    }
  }

  setSearch(q: string) {
    this.set({ searchQuery: q });
  }

  // ---------- mention index (cached per docs/binder identity) ----------

  private indexCache: { docs: unknown; binder: unknown; index: MentionIndex } | null = null;
  mentionIndex(): MentionIndex {
    const p = this.state.project;
    if (!p) return { byEntity: new Map(), byScene: new Map() };
    const c = this.indexCache;
    if (c && c.docs === p.docs && c.binder === p.meta.binder) return c.index;
    const index = buildMentionIndex(p.docs, sceneOrder(p.meta.binder));
    this.indexCache = { docs: p.docs, binder: p.meta.binder, index };
    return index;
  }

  // ---------- editing ----------

  updateDoc(id: string, patch: { title?: string; body?: string; fields?: Record<string, unknown> }, opts: { external?: boolean } = {}) {
    const p = this.state.project;
    const doc = p?.docs[id];
    if (!p || !doc) return;
    if (patch.body !== undefined && patch.body !== doc.body && doc.kind === 'scene' && doc.body.trim()) this.autoSnapshot(doc);
    const next: Doc = {
      ...doc,
      title: patch.title ?? doc.title,
      body: patch.body ?? doc.body,
      fields: patch.fields ? { ...doc.fields, ...patch.fields } : doc.fields,
    };
    if (next.kind === 'scene') next.fields = { ...next.fields, updated: nowIso() };
    const counts = patch.body !== undefined && doc.kind === 'scene' ? { ...this.state.counts, [id]: countMarkdown(next.body) } : this.state.counts;
    this.set({
      project: { ...p, docs: { ...p.docs, [id]: next } },
      counts,
      externalRev: opts.external ? this.state.externalRev + 1 : this.state.externalRev,
    });
    this.dirtyDocs.add(id);
    this.schedule();
  }

  updateMeta(patch: Partial<ProjectMeta>) {
    const p = this.state.project;
    if (!p) return;
    this.set({ project: { ...p, meta: { ...p.meta, ...patch } } });
    this.markMeta();
    if (patch.title) this.touch();
    if ((patch.title || patch.mode) && this.state.project) this.onOpened?.(this.state.project);
  }

  setMode(mode: Mode) {
    this.updateMeta({ mode });
    this.toast(mode === 'short' ? 'Switched to short story mode' : 'Switched to novel mode');
  }

  addNode(kind: NodeKind, opts: { title?: string; targetId?: string | null; pos?: DropPosition; select?: boolean } = {}) {
    const p = this.state.project;
    if (!p) return null;
    const defaults: Record<NodeKind, string> = { part: 'New part', chapter: 'New chapter', scene: 'Untitled scene' };
    const doc = makeDoc(kind, opts.title ?? defaults[kind]);
    const place = opts.targetId !== undefined ? { targetId: opts.targetId, pos: opts.pos ?? 'after' } : placementFor(p.meta.binder, kind, this.state.selectedId);
    const binder = insertNode(p.meta.binder, { id: doc.id }, place.targetId, place.pos);
    this.set({
      project: { ...p, meta: { ...p.meta, binder }, docs: { ...p.docs, [doc.id]: doc } },
      counts: { ...this.state.counts, [doc.id]: 0 },
      expanded: place.targetId && place.pos === 'inside' ? { ...this.state.expanded, [place.targetId]: true } : this.state.expanded,
    });
    this.dirtyDocs.add(doc.id);
    this.markMeta();
    if (opts.select !== false) {
      this.select(doc.id);
      this.setRenaming(doc.id);
    }
    return doc.id;
  }

  addCharacter(title = 'New character', fields: Record<string, unknown> = {}, opts: { select?: boolean } = {}) {
    return this.addEntity(makeDoc('character', title, '', { ...newCharacterFields(), ...fields }), opts.select ?? true);
  }

  addWorld(kind: WorldKind, title?: string, parent?: string | null, opts: { select?: boolean } = {}) {
    return this.addEntity(makeDoc('world', title ?? 'New entry', '', newWorldFields(kind, parent)), opts.select ?? true);
  }

  private addEntity(doc: Doc, select: boolean) {
    const p = this.state.project;
    if (!p) return null;
    this.set({ project: { ...p, docs: { ...p.docs, [doc.id]: doc } } });
    this.dirtyDocs.add(doc.id);
    this.schedule();
    if (select) {
      this.select(doc.id);
      this.set({ renamingId: doc.id });
    }
    return doc.id;
  }

  addMap(title: string, image: { path: string; width: number; height: number } | null, parent?: string | null) {
    const fields: Record<string, unknown> = { pins: [], journeys: [] };
    if (image) Object.assign(fields, { image: image.path, width: image.width, height: image.height });
    if (parent) fields.parent = parent;
    return this.addEntity(makeDoc('map', title, '', fields), true);
  }

  addEvent(scope: 'world' | 'story', date?: string, opts: { select?: boolean; title?: string } = {}) {
    return this.addEntity(makeDoc('event', opts.title ?? 'New event', '', { date: date || undefined, scope, entities: [] }), opts.select ?? true);
  }

  addMarket(title = 'New market', opts: { select?: boolean } = {}) {
    return this.addEntity(makeDoc('market', title, '', { simultaneous: true }), opts.select ?? true);
  }

  addSubmission(fields: { market?: string | null; story?: string | null } = {}, opts: { select?: boolean } = {}) {
    const p = this.state.project;
    const title = fields.market && p?.docs[fields.market] ? p.docs[fields.market].title : 'New submission';
    const id = this.addEntity(makeDoc('submission', title, '', { market: fields.market ?? undefined, story: fields.story ?? undefined, sent: dayKey(), status: 'pending' }), false);
    if (id && (opts.select ?? true)) this.select(id);
    return id;
  }

  showPin(mapId: string, pinId: string) {
    this.set({ focusPin: { map: mapId, pin: pinId } });
    this.select(mapId);
  }

  clearFocusPin() {
    if (this.state.focusPin) this.set({ focusPin: null });
  }

  addSubplot(title = 'New subplot', opts: { select?: boolean } = {}) {
    const p = this.state.project;
    if (!p) return null;
    const used = Object.values(p.docs)
      .filter((d) => d.kind === 'subplot')
      .map(subplotColorOf);
    // First unused color; once all are taken, cycle.
    let color = used.length % SUBPLOT_COLORS;
    for (let i = 0; i < SUBPLOT_COLORS; i++) {
      if (!used.includes(i)) {
        color = i;
        break;
      }
    }
    return this.addEntity(makeDoc('subplot', title, '', { color, status: 'setup' }), opts.select ?? true);
  }

  setSceneSubplot(sceneId: string, subplotId: string, on: boolean) {
    const scene = this.state.project?.docs[sceneId];
    if (!scene) return;
    this.updateDoc(sceneId, { fields: toggleSubplotPatch(scene, subplotId, on) });
  }

  setBeat(sceneId: string, subplotId: string, note: string) {
    const scene = this.state.project?.docs[sceneId];
    if (!scene) return;
    this.updateDoc(sceneId, { fields: beatPatch(scene, subplotId, note) });
  }

  move(dragId: string, targetId: string | null, pos: DropPosition) {
    const p = this.state.project;
    if (!p) return;
    const binder = moveNode(p.meta.binder, dragId, targetId, pos);
    if (binder === p.meta.binder) return;
    this.set({ project: { ...p, meta: { ...p.meta, binder } } });
    if (pos === 'inside' && targetId) this.toggleExpanded(targetId, true);
    this.markMeta();
  }

  /** Move a node and everything under it to .inkwell/trash. */
  async remove(id: string) {
    const p = this.state.project;
    if (!p) return;
    const entity = isEntityId(id);
    const node = entity ? { id } : findNode(p.meta.binder, id);
    if (!node || !p.docs[id]) return;
    const ids = [id, ...(node.children ? flatIds(node.children) : [])];
    const order = flatIds(p.meta.binder);
    const tree = entity ? p.meta.binder : removeNode(p.meta.binder, id).tree;
    const docs = { ...p.docs };
    for (const x of ids) delete docs[x];
    if (entity && p.docs[id].kind === 'subplot') {
      // Scenes forget a deleted subplot (and its beat notes).
      for (const d of Object.values(docs)) {
        if (d.kind === 'scene' && sceneSubplots(d).includes(id)) {
          docs[d.id] = { ...d, fields: { ...d.fields, ...toggleSubplotPatch(d, id, false) } };
          this.dirtyDocs.add(d.id);
        }
      }
    }
    if (entity) {
      // Children of a deleted world entry move up to its parent.
      const parent = p.docs[id].fields.parent;
      for (const d of Object.values(docs)) {
        if (d.fields.parent === id) {
          docs[d.id] = { ...d, fields: { ...d.fields, parent: parent ?? undefined } };
          this.dirtyDocs.add(d.id);
        }
      }
    }
    let selectedId = this.state.selectedId;
    if (selectedId && ids.includes(selectedId)) {
      if (entity) selectedId = null;
      else {
        const idx = order.indexOf(id);
        const remaining = flatIds(tree);
        selectedId = remaining.find((x) => order.indexOf(x) > idx) ?? remaining[remaining.length - 1] ?? null;
      }
    }
    this.set({ project: { ...p, meta: { ...p.meta, binder: tree }, docs } });
    this.select(selectedId, { history: false });
    this.markMeta();
    await this.flush();
    for (const x of ids) {
      const path = docPath(x);
      const text = (await p.fs.read(path)) ?? (p.docs[x] ? serializeDoc(p.docs[x]) : null);
      if (text !== null) await p.fs.write(join(TRASH_DIR, `${x}.md`), text);
      await p.fs.remove(path);
      this.dirtyDocs.delete(x);
      delete this.disk[path];
    }
    this.set({ historyRev: this.state.historyRev + 1 });
    const title = p.docs[id]?.title || 'Item';
    this.toast(`Moved “${title}”${ids.length > 1 ? ` and ${ids.length - 1} inside it` : ''} to the trash folder`);
  }

  /** Split a scene: everything from `bodyAfter` becomes a new scene right after it. */
  splitScene(id: string, bodyBefore: string, bodyAfter: string) {
    const p = this.state.project;
    const doc = p?.docs[id];
    if (!p || !doc) return;
    void this.takeSnapshot(id, { reason: 'Before splitting' });
    // A scene break right at the split point is redundant: the scene boundary replaces it.
    bodyBefore = bodyBefore.replace(/(\n\s*)*\*\*\*\s*$/, '').trimEnd();
    bodyAfter = bodyAfter.replace(/^\s*\*\*\*(\s*\n)*/, '').trimStart();
    this.updateDoc(id, { body: bodyBefore }, { external: true });
    const newId = this.addNode('scene', { title: `${doc.title} (cont.)`, targetId: id, pos: 'after' });
    if (newId) this.updateDoc(newId, { body: bodyAfter }, { external: true });
    this.setRenaming(null);
  }

  // ---------- snapshots ----------

  private snapChecked = new Set<string>();

  /** The first edit of a scene each day keeps a copy of how it was. */
  private autoSnapshot(before: Doc) {
    const key = `${before.id}:${dayKey()}`;
    if (this.snapChecked.has(key)) return;
    this.snapChecked.add(key);
    const p = this.state.project;
    if (!p) return;
    void (async () => {
      try {
        const files = await p.fs.list(join(SNAPSHOT_DIR, before.id));
        const today = dayKey();
        if (files.some((f) => dayKey(snapshotDate(f)) === today)) return;
        await this.writeSnapshot(before, { reason: 'Start of the day' });
      } catch {
        /* snapshots are a safety net; never block writing */
      }
    })();
  }

  private async writeSnapshot(doc: Doc, info: { name?: string; reason?: string }) {
    const p = this.state.project;
    if (!p) return;
    const copy: Doc = { ...doc, fields: { ...doc.fields, snapshotName: info.name || undefined, snapshotReason: info.reason || undefined } };
    await p.fs.write(join(SNAPSHOT_DIR, doc.id, snapshotFileName(new Date())), serializeDoc(copy));
    this.set({ historyRev: this.state.historyRev + 1 });
  }

  async takeSnapshot(id: string, info: { name?: string; reason?: string } = {}) {
    const doc = this.state.project?.docs[id];
    if (!doc) return;
    await this.writeSnapshot(doc, info);
    if (!info.reason) this.toast(info.name ? `Snapshot “${info.name}” saved` : 'Snapshot saved');
  }

  async listSnapshots(id: string): Promise<SnapshotInfo[]> {
    const p = this.state.project;
    if (!p) return [];
    const dir = join(SNAPSHOT_DIR, id);
    const files = (await p.fs.list(dir)).filter((f) => f.endsWith('.md')).sort().reverse();
    const out: SnapshotInfo[] = [];
    for (const file of files) {
      const text = await p.fs.read(join(dir, file));
      if (!text) continue;
      try {
        const d = parseDoc(text, id);
        out.push({
          file,
          taken: snapshotDate(file),
          name: typeof d.fields.snapshotName === 'string' ? d.fields.snapshotName : undefined,
          reason: typeof d.fields.snapshotReason === 'string' ? d.fields.snapshotReason : undefined,
          title: d.title,
          body: d.body,
          words: countMarkdown(d.body),
        });
      } catch {
        /* skip unreadable snapshot */
      }
    }
    return out;
  }

  async restoreSnapshot(id: string, snap: SnapshotInfo) {
    const doc = this.state.project?.docs[id];
    if (!doc) return;
    await this.writeSnapshot(doc, { reason: 'Before restoring an earlier version' });
    this.updateDoc(id, { body: snap.body }, { external: true });
    this.toast(`Restored the version from ${snap.taken.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`);
  }

  async deleteSnapshot(id: string, snap: SnapshotInfo) {
    const p = this.state.project;
    if (!p) return;
    await p.fs.remove(join(SNAPSHOT_DIR, id, snap.file));
    this.set({ historyRev: this.state.historyRev + 1 });
  }

  // ---------- trash ----------

  async listTrash(): Promise<TrashItem[]> {
    const p = this.state.project;
    if (!p) return [];
    const files = (await p.fs.list(TRASH_DIR)).filter((f) => f.endsWith('.md'));
    const out: TrashItem[] = [];
    for (const file of files) {
      const text = await p.fs.read(join(TRASH_DIR, file));
      if (!text) continue;
      try {
        const d = parseDoc(text, file.replace(/\.md$/, ''));
        out.push({ file, id: d.id, kind: d.kind, title: d.title });
      } catch {
        /* skip */
      }
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  async restoreFromTrash(item: TrashItem) {
    const p = this.state.project;
    if (!p) return;
    const text = await p.fs.read(join(TRASH_DIR, item.file));
    if (!text) return;
    const doc = parseDoc(text, item.id);
    if (p.docs[doc.id]) {
      this.toast(`“${doc.title}” is already in the project.`);
      return;
    }
    const isNode = doc.kind === 'scene' || doc.kind === 'chapter' || doc.kind === 'part';
    const binder = isNode ? insertNode(p.meta.binder, { id: doc.id }, null, 'inside') : p.meta.binder;
    this.set({
      project: { ...p, meta: { ...p.meta, binder }, docs: { ...p.docs, [doc.id]: doc } },
      counts: { ...this.state.counts, [doc.id]: doc.kind === 'scene' ? countMarkdown(doc.body) : 0 },
    });
    this.dirtyDocs.add(doc.id);
    if (isNode) this.markMeta();
    else this.schedule();
    await this.flush();
    await p.fs.remove(join(TRASH_DIR, item.file));
    this.set({ historyRev: this.state.historyRev + 1 });
    this.toast(isNode ? `Restored “${doc.title}” to the end of the manuscript` : `Restored “${doc.title}”`);
  }

  // ---------- persistence ----------

  private markMeta() {
    this.metaDirty = true;
    this.schedule();
  }

  private schedule() {
    if (this.state.save !== 'pending') this.set({ save: 'pending' });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  // ---------- ideas ----------

  setCapture(open: boolean, forId: string | null = null) {
    this.set({ captureOpen: open, captureFor: open ? forId : null, palette: false, settings: false });
  }

  /** Save a new idea, sorted on the way in. */
  addIdea(text: string, opts: { select?: boolean; target?: string | null; links?: string[] } = {}) {
    const p = this.state.project;
    const body = text.trim();
    if (!p || !body) return null;
    const mentioned = detectLinks(body, p.docs).map((id) => p.docs[id]);
    const guess = guessType(body, mentioned);
    const doc = makeDoc('idea', ideaTitle(body) || 'Untitled idea', body, {
      ideaType: guess.type,
      typeAuto: true,
      status: 'new',
      links: opts.links?.length ? opts.links : undefined,
      target: opts.target || undefined,
      created: nowIso(),
    });
    const id = this.addEntity(doc, false);
    if (id && opts.select) this.select(id);
    return id;
  }

  /** Edit an idea's text; its title and (until chosen by hand) its type follow along. */
  editIdeaText(id: string, md: string) {
    const p = this.state.project;
    const doc = p?.docs[id];
    if (!p || !doc) return;
    const fields: Record<string, unknown> = {};
    if (doc.fields.typeAuto !== false) fields.ideaType = guessType(md, detectLinks(md, p.docs).map((x) => p.docs[x])).type;
    const title = doc.fields.titleAuto === false ? doc.title : ideaTitle(md) || doc.title;
    this.updateDoc(id, { body: md, title, fields });
  }

  setIdeaType(id: string, type: IdeaType) {
    this.updateDoc(id, { fields: { ideaType: type, typeAuto: false } });
  }

  /** Turn an idea into a scene, character, place, world entry, event or subplot. */
  useIdea(id: string, as: 'scene' | 'character' | 'place' | 'world' | 'event' | 'subplot'): string | null {
    const p = this.state.project;
    const doc = p?.docs[id];
    if (!p || !doc) return null;
    const idea = ideaOf(doc);
    const title = doc.title || 'Untitled';
    let nid: string | null = null;
    if (as === 'scene') {
      const t = idea.target && p.docs[idea.target] ? idea.target : null;
      nid = this.addNode('scene', t ? { title, targetId: t, pos: kindOf(t) === 'scene' ? 'after' : 'inside', select: false } : { title, select: false });
      if (nid) this.updateDoc(nid, { fields: { synopsis: markdownToText(idea.text).replace(/\s+/g, ' ').trim(), status: 'idea', fromIdea: id } });
    } else {
      nid =
        as === 'character'
          ? this.addCharacter(title, {}, { select: false })
          : as === 'place'
            ? this.addWorld('place', title, null, { select: false })
            : as === 'world'
              ? this.addWorld('other', title, null, { select: false })
              : as === 'event'
                ? this.addEvent('story', undefined, { select: false, title })
                : this.addSubplot(title, { select: false });
      if (nid) this.updateDoc(nid, { body: idea.text, fields: { fromIdea: id } });
    }
    if (!nid) return null;
    this.updateDoc(id, { fields: { status: 'used', usedIn: nid } });
    this.select(nid);
    const label = { scene: 'a scene', character: 'a character', place: 'a place', world: 'a world entry', event: 'a timeline event', subplot: 'a subplot' }[as];
    this.toast(`Made ${label} from the idea. It is marked as used.`);
    return nid;
  }

  /** Add an idea's text to the notes of an existing character, place, subplot or event. */
  addIdeaTo(id: string, entityId: string) {
    const p = this.state.project;
    const doc = p?.docs[id];
    const ent = p?.docs[entityId];
    if (!p || !doc || !ent) return;
    const body = ent.body.trim() ? `${ent.body.trimEnd()}\n\n${doc.body.trim()}` : doc.body.trim();
    this.updateDoc(entityId, { body }, { external: true });
    this.updateDoc(id, { fields: { status: 'used', usedIn: entityId } });
    this.toast(`Added to ${ent.title || 'the notes'}.`);
  }

  // ---------- sync conflicts and changes from other devices ----------

  setConflictsOpen(open: boolean) {
    this.set({ conflictsOpen: open, palette: false, settings: false });
  }

  /** Same title, body and fields means nothing was lost: the copy can go. */
  private sameDoc(a: Doc, b: Doc) {
    const strip = (d: Doc) => serializeDoc({ ...d, fields: { ...d.fields, updated: undefined } });
    return strip(a) === strip(b);
  }

  private async adoptConflicts(found: ConflictCopy[]) {
    const p = this.state.project;
    if (!p || !found.length) return;
    const known = new Set(this.state.conflicts.map((c) => c.path ?? `mem:${c.id}`));
    const fresh: ConflictCopy[] = [];
    for (const c of found) {
      if (c.path && known.has(c.path)) continue;
      const mine = p.docs[c.id];
      if (mine && this.sameDoc(mine, c.doc)) {
        if (c.path) await p.fs.remove(c.path).catch(() => undefined);
        continue;
      }
      fresh.push(c);
    }
    if (!fresh.length) return;
    this.set({ conflicts: [...this.state.conflicts, ...fresh] });
    this.toast(fresh.length === 1 ? `Two versions of “${fresh[0].doc.title || 'a document'}” need sorting out.` : `${fresh.length} documents have two versions to sort out.`);
  }

  async resolveConflict(c: ConflictCopy, choice: 'mine' | 'theirs' | 'both') {
    const p = this.state.project;
    if (!p) return;
    const mine = p.docs[c.id];
    if (choice === 'mine') {
      // Keep the other version recoverable from the document's snapshots.
      if (mine) await this.writeSnapshot(c.doc, { reason: `Other version (${c.label.toLowerCase()})` });
    } else if (choice === 'theirs' && mine) {
      await this.writeSnapshot(mine, { reason: 'Before using the other version' });
      this.updateDoc(c.id, { title: c.doc.title, body: c.doc.body, fields: { ...c.doc.fields } }, { external: true });
    } else if (choice === 'both' || !mine) {
      const kind = c.doc.kind;
      const copy = makeDoc(kind, `${c.doc.title || 'Untitled'} (other version)`, c.doc.body, { ...c.doc.fields });
      const cur = this.state.project!;
      const meta = dirFor(c.id) === 'manuscript' && findNode(cur.meta.binder, c.id) ? { ...cur.meta, binder: insertNode(cur.meta.binder, { id: copy.id }, c.id, 'after') } : cur.meta;
      this.set({ project: { ...cur, meta, docs: { ...cur.docs, [copy.id]: copy } }, counts: { ...this.state.counts, [copy.id]: kind === 'scene' ? countMarkdown(copy.body) : 0 } });
      this.dirtyDocs.add(copy.id);
      if (meta !== cur.meta) this.metaDirty = true;
      this.schedule();
    }
    if (c.path) await p.fs.remove(c.path).catch(() => undefined);
    const rest = this.state.conflicts.filter((x) => x !== c);
    this.set({ conflicts: rest, conflictsOpen: rest.length > 0 && this.state.conflictsOpen });
    this.toast(choice === 'mine' ? 'Kept your version; the other is in Snapshots.' : choice === 'theirs' ? 'Using the other version; yours is in Snapshots.' : 'Kept both versions.');
  }

  private checking = false;
  private writeSeq = 0;

  /** Pick up edits made on another device and synced into the project folder. */
  async checkExternal(): Promise<number> {
    const p = this.state.project;
    if (!p || this.checking || this.flushing || p.localKey) return 0;
    this.checking = true;
    const seq = this.writeSeq;
    try {
      const fresh = await loadProject(p.fs);
      const cur = this.state.project;
      // A save landed while we were reading: our snapshot of the folder is stale.
      if (!cur || cur.fs !== p.fs || seq !== this.writeSeq || this.flushing) return 0;
      let docs = cur.docs;
      let counts = this.state.counts;
      let changed = 0;
      const raced: ConflictCopy[] = [];
      for (const [id, doc] of Object.entries(fresh.docs)) {
        const path = docPath(id);
        const text = fresh.disk[path];
        if (!text || text === this.disk[path]) continue;
        const local = docs[id];
        if (local && this.dirtyDocs.has(id)) {
          // Both sides changed: keep typing safe, offer the other version as a conflict.
          if (!this.sameDoc(local, doc)) raced.push({ id, path: null, doc, label: 'Changed on another device' });
          this.disk[path] = text;
          continue;
        }
        this.disk[path] = text;
        if (local && this.sameDoc(local, doc)) continue;
        docs = { ...docs, [id]: doc };
        if (doc.kind === 'scene') counts = { ...counts, [id]: countMarkdown(doc.body) };
        changed++;
      }
      let meta = cur.meta;
      const metaText = fresh.disk[META_FILE];
      if (metaText !== this.disk[META_FILE] && !this.metaDirty) {
        this.disk[META_FILE] = metaText;
        meta = fresh.meta;
        changed++;
      } else if (this.metaDirty) {
        // Keep our binder but make sure new manuscript files from elsewhere are listed.
        let binder = meta.binder;
        for (const id of Object.keys(fresh.docs)) if (dirFor(id) === 'manuscript' && !findNode(binder, id) && !cur.docs[id]) binder = insertNode(binder, { id }, null, 'inside');
        if (binder !== meta.binder) meta = { ...meta, binder };
      }
      if (changed) {
        const selected = this.state.selectedId && !docs[this.state.selectedId] ? null : this.state.selectedId;
        this.set({ project: { ...cur, docs, meta }, counts, selectedId: selected, externalRev: this.state.externalRev + 1 });
        this.toast(changed === 1 ? 'Picked up a change made on another device.' : `Picked up ${changed} changes made on another device.`);
      }
      await this.adoptConflicts([...fresh.conflicts, ...raced]);
      return changed;
    } catch {
      return 0; // a half-synced folder; try again next time
    } finally {
      this.checking = false;
    }
  }

  get hasPending() {
    return this.dirtyDocs.size > 0 || this.metaDirty;
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) await this.flushing;
    const p = this.state.project;
    if (!p || !this.hasPending) return;
    const docIds = [...this.dirtyDocs];
    const meta = this.metaDirty;
    this.dirtyDocs.clear();
    this.metaDirty = false;
    this.writeSeq++;
    this.set({ save: 'saving' });
    this.flushing = (async () => {
      try {
        for (const id of docIds) {
          const doc = p.docs[id];
          if (!doc) continue;
          const path = docPath(id);
          const text = serializeDoc(doc);
          if (this.disk[path] === text) continue;
          await p.fs.write(path, text);
          this.disk[path] = text;
        }
        this.trackWords();
        if (this.statsDirty) {
          this.statsDirty = false;
          await p.fs.write(STATS_FILE, JSON.stringify(this.state.stats, null, 1));
        }
        if (meta) {
          const text = serializeMeta(this.state.project?.meta ?? p.meta);
          if (this.disk[META_FILE] !== text) {
            await p.fs.write(META_FILE, text);
            this.disk[META_FILE] = text;
          }
        }
        this.set({ save: this.hasPending ? 'pending' : 'saved', saveError: undefined });
        this.touch();
      } catch (e) {
        docIds.forEach((id) => this.dirtyDocs.add(id));
        if (meta) this.metaDirty = true;
        this.set({ save: 'error', saveError: (e as Error).message });
        this.toast(`Couldn’t save: ${(e as Error).message}`);
      }
    })();
    await this.flushing;
    this.flushing = null;
  }
}

export const store = new Store();

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

export const isScene = (id: string | null) => !!id && kindOf(id) === 'scene';

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (store.hasPending) {
      void store.flush();
      e.preventDefault();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
  });
}
