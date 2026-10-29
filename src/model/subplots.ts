import { flatIds, parentOf } from './binder';
import { kindOf } from './ids';
import type { BinderNode, Doc } from './types';

// Subplots are threads that run through scenes. Scenes reference subplots (never the
// reverse), so the plot grid is always computed from the scenes themselves.

export const SUBPLOT_STATUSES = ['setup', 'rising', 'resolved', 'abandoned'] as const;
export type SubplotStatus = (typeof SUBPLOT_STATUSES)[number];
export const SUBPLOT_COLORS = 10;
export const GAP_WARNING_CHAPTERS = 5;

const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export const subplotStatusOf = (d: Doc): SubplotStatus =>
  (SUBPLOT_STATUSES as readonly string[]).includes(d.fields.status as string) ? (d.fields.status as SubplotStatus) : 'setup';
export const subplotColorOf = (d: Doc): number => {
  const c = Number(d.fields.color);
  return Number.isInteger(c) && c >= 0 && c < SUBPLOT_COLORS ? c : 0;
};
export const subplotCharacters = (d: Doc) => strList(d.fields.characters);

/** Subplot ids a scene belongs to (only ones that still exist when `docs` is given). */
export function sceneSubplots(scene: Doc, docs?: Record<string, Doc>): string[] {
  const ids = strList(scene.fields.subplots);
  return docs ? ids.filter((id) => docs[id]?.kind === 'subplot') : ids;
}

export function beatsOf(scene: Doc): Record<string, string> {
  const b = scene.fields.beats;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** Fields patch that adds or removes a subplot on a scene, keeping its beat note in step. */
export function toggleSubplotPatch(scene: Doc, subplotId: string, on: boolean): Record<string, unknown> {
  const ids = strList(scene.fields.subplots);
  const beats = beatsOf(scene);
  if (on) return { subplots: ids.includes(subplotId) ? ids : [...ids, subplotId] };
  delete beats[subplotId];
  return { subplots: ids.filter((x) => x !== subplotId), beats: Object.keys(beats).length ? beats : undefined };
}

export function beatPatch(scene: Doc, subplotId: string, note: string): Record<string, unknown> {
  const beats = { ...beatsOf(scene) };
  if (note.trim()) beats[subplotId] = note;
  else delete beats[subplotId];
  return { beats: Object.keys(beats).length ? beats : undefined };
}

/** Scenes grouped by their chapter, in manuscript order. Scenes outside chapters form their own group. */
export interface SceneGroup {
  /** Chapter id, or the id of the part / null (root) for scenes not inside a chapter. */
  id: string | null;
  title: string;
  scenes: string[];
  /** Scenes that sit outside any chapter. */
  loose?: boolean;
}

export function sceneGroups(binder: BinderNode[], docs: Record<string, Doc>): SceneGroup[] {
  const groups: SceneGroup[] = [];
  const chapters = new Map<string, SceneGroup>();
  for (const id of flatIds(binder)) {
    const k = kindOf(id);
    if (k === 'chapter') {
      const g: SceneGroup = { id, title: docs[id]?.title || 'Untitled chapter', scenes: [] };
      groups.push(g);
      chapters.set(id, g);
    } else if (k === 'scene') {
      const p = parentOf(binder, id);
      const chapter = p ? chapters.get(p.id) : undefined;
      if (chapter) {
        chapter.scenes.push(id);
        continue;
      }
      const key = p?.id ?? null;
      const last = groups[groups.length - 1];
      if (last?.loose && last.id === key) last.scenes.push(id);
      else groups.push({ id: key, title: key ? docs[key]?.title || 'Untitled' : 'Unfiled scenes', scenes: [id], loose: true });
    }
  }
  return groups;
}

export type SubplotWarning = { kind: 'gap'; chapters: number; afterScene: string | null } | { kind: 'unresolved' } | { kind: 'unused' };

export interface SubplotAnalysis {
  scenes: string[];
  /** Index (into sceneGroups) of each chapter the subplot touches. */
  chapters: number[];
  warnings: SubplotWarning[];
}

export function analyzeSubplots(binder: BinderNode[], docs: Record<string, Doc>, gap = GAP_WARNING_CHAPTERS): Map<string, SubplotAnalysis> {
  const groups = sceneGroups(binder, docs).filter((g) => g.scenes.length || g.id);
  const out = new Map<string, SubplotAnalysis>();
  const subplots = Object.values(docs).filter((d) => d.kind === 'subplot');
  for (const sp of subplots) out.set(sp.id, { scenes: [], chapters: [], warnings: [] });
  groups.forEach((g, gi) => {
    for (const sid of g.scenes) {
      const scene = docs[sid];
      if (!scene) continue;
      for (const spId of sceneSubplots(scene)) {
        const a = out.get(spId);
        if (!a) continue;
        a.scenes.push(sid);
        if (a.chapters[a.chapters.length - 1] !== gi) a.chapters.push(gi);
      }
    }
  });
  for (const sp of subplots) {
    const a = out.get(sp.id)!;
    const status = subplotStatusOf(sp);
    if (!a.scenes.length) {
      a.warnings.push({ kind: 'unused' });
      continue;
    }
    // Long absences between appearances.
    for (let i = 1; i < a.chapters.length; i++) {
      const missing = a.chapters[i] - a.chapters[i - 1] - 1;
      if (missing >= gap) {
        const lastScene = [...groups[a.chapters[i - 1]].scenes].reverse().find((s) => a.scenes.includes(s)) ?? null;
        a.warnings.push({ kind: 'gap', chapters: missing, afterScene: lastScene });
      }
    }
    // A thread still open that vanished well before the end of the manuscript.
    const tail = groups.length - 1 - a.chapters[a.chapters.length - 1];
    if (status !== 'resolved' && status !== 'abandoned') {
      if (tail >= gap) {
        const lastScene = [...groups[a.chapters[a.chapters.length - 1]].scenes].reverse().find((s) => a.scenes.includes(s)) ?? null;
        a.warnings.push({ kind: 'gap', chapters: tail, afterScene: lastScene });
      }
      a.warnings.push({ kind: 'unresolved' });
    }
  }
  return out;
}

export function warningText(w: SubplotWarning): string {
  if (w.kind === 'unused') return 'Not in any scene yet';
  if (w.kind === 'unresolved') return 'Not marked resolved';
  return `Missing for ${w.chapters} chapters`;
}
