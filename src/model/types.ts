// Core data types for an Inkwell project. See the build spec, "Project file format".

export type Mode = 'novel' | 'short';
export type Status = 'idea' | 'outline' | 'draft' | 'revised' | 'final';
export type NodeKind = 'part' | 'chapter' | 'scene';
export type EntityKind = 'character' | 'world' | 'subplot' | 'map' | 'event' | 'submission' | 'market' | 'idea';
export type DocKind = NodeKind | EntityKind;

export const ROLES = ['protagonist', 'antagonist', 'supporting', 'minor'] as const;
export type Role = (typeof ROLES)[number];

export const WORLD_KINDS = ['place', 'culture', 'religion', 'magic', 'technology', 'history', 'species', 'item', 'language', 'other'] as const;
export type WorldKind = (typeof WORLD_KINDS)[number];

export const STATUSES: Status[] = ['idea', 'outline', 'draft', 'revised', 'final'];

/** Order and nesting of the manuscript. Titles live in the files, not here. */
export interface BinderNode {
  id: string;
  children?: BinderNode[];
}

export interface Goals {
  project?: number;
  daily?: number;
  deadline?: string;
}

/** Contents of project.yaml */
export interface ProjectMeta {
  format: 1;
  title: string;
  author?: string;
  mode: Mode;
  goals?: Goals;
  binder: BinderNode[];
  [key: string]: unknown;
}

/** One Markdown file with YAML frontmatter. */
export interface Doc {
  id: string;
  kind: DocKind;
  title: string;
  /** Markdown body (prose). */
  body: string;
  /** Every other frontmatter field, kept in file order so unknown keys survive a save. */
  fields: Record<string, unknown>;
}

export interface SceneFields {
  synopsis?: string;
  status?: Status;
  target?: number;
  tags?: string[];
  created?: string;
  updated?: string;
}
