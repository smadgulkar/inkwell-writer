import type { Doc, Role, WorldKind } from './types';

// Characters and world entries: field templates and typed accessors over Doc.fields.

export const CHARACTER_FIELDS = ['Age', 'Appearance', 'Occupation', 'Motivation', 'Fear', 'Secret', 'Voice'];

export const WORLD_TEMPLATES: Record<WorldKind, { label: string; plural: string; fields: string[]; rules?: boolean }> = {
  place: { label: 'Place', plural: 'Places', fields: ['Type', 'Climate', 'Population', 'Ruled by', 'Known for'] },
  culture: { label: 'Culture', plural: 'Cultures and factions', fields: ['Values', 'Customs', 'Language', 'Dress', 'Food'] },
  religion: { label: 'Religion', plural: 'Religions', fields: ['Deities', 'Core beliefs', 'Practices', 'Clergy', 'Heresies'] },
  magic: { label: 'Magic system', plural: 'Magic', fields: ['Source', 'Who can use it', 'How it is learned'], rules: true },
  technology: { label: 'Technology', plural: 'Technology and science', fields: ['Inventor', 'Availability', 'How it works'], rules: true },
  history: { label: 'Historical event', plural: 'History', fields: ['When', 'Participants', 'Outcome', 'Consequences'] },
  species: { label: 'Species', plural: 'Species', fields: ['Habitat', 'Lifespan', 'Appearance', 'Temperament'] },
  item: { label: 'Item', plural: 'Items and artifacts', fields: ['Owner', 'Origin', 'Powers'] },
  language: { label: 'Language', plural: 'Languages', fields: ['Speakers', 'Script', 'Sample phrases'] },
  other: { label: 'Note', plural: 'Other', fields: [] },
};

export const ROLE_LABEL: Record<Role, string> = {
  protagonist: 'Protagonist',
  antagonist: 'Antagonist',
  supporting: 'Supporting',
  minor: 'Minor',
};

export interface ArcBeat {
  label: string;
  scene?: string;
}
export interface Arc {
  start?: string;
  end?: string;
  beats?: ArcBeat[];
}
export interface Relationship {
  to: string;
  kind?: string;
  note?: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

export function profileOf(doc: Doc): [string, string][] {
  const p = doc.fields.profile;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
  return Object.entries(p as Record<string, unknown>).map(([k, v]) => [k, str(v)]);
}

export function profileFrom(rows: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of rows) if (k.trim()) out[k.trim()] = v;
  return out;
}

export const aliasesOf = (doc: Doc) => strList(doc.fields.aliases);
export const roleOf = (doc: Doc): Role => ((['protagonist', 'antagonist', 'supporting', 'minor'] as const).includes(doc.fields.role as Role) ? (doc.fields.role as Role) : 'supporting');
export const worldKindOf = (doc: Doc): WorldKind => {
  const k = doc.fields.kind;
  return typeof k === 'string' && k in WORLD_TEMPLATES ? (k as WorldKind) : 'other';
};
export const parentOfEntity = (doc: Doc) => (typeof doc.fields.parent === 'string' ? doc.fields.parent : null);
export const listField = (doc: Doc, key: 'rules' | 'costs' | 'limits') => strList(doc.fields[key]);

export function arcOf(doc: Doc): Arc {
  const a = doc.fields.arc as Arc | undefined;
  if (!a || typeof a !== 'object') return {};
  return {
    start: str(a.start),
    end: str(a.end),
    beats: Array.isArray(a.beats) ? a.beats.filter((b) => b && typeof b === 'object').map((b) => ({ label: str(b.label), scene: b.scene ? str(b.scene) : undefined })) : [],
  };
}

export function relationshipsOf(doc: Doc): Relationship[] {
  const r = doc.fields.relationships;
  if (!Array.isArray(r)) return [];
  return r
    .filter((x) => x && typeof x === 'object' && typeof x.to === 'string')
    .map((x) => ({ to: x.to as string, kind: x.kind ? str(x.kind) : undefined, note: x.note ? str(x.note) : undefined }));
}

/** Words that count as a mention of this entity in prose: name, aliases, and a character's first name. */
export function mentionTerms(doc: Doc): string[] {
  const terms = new Set<string>();
  const name = doc.title.trim();
  if (name) terms.add(name);
  for (const a of aliasesOf(doc)) terms.add(a.trim());
  if (doc.kind === 'character') {
    const first = name.split(/\s+/)[0];
    if (first && first.length >= 3 && first !== name) terms.add(first);
  }
  // "The Salt Flats" is also written "Salt Flats".
  for (const t of [...terms]) {
    const m = /^(the|a|an)\s+(.{3,})$/i.exec(t);
    if (m) terms.add(m[2]);
  }
  return [...terms].filter((t) => t.length >= 2);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** A stable hue per id, used for avatars. */
export function hueOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function newCharacterFields(): Record<string, unknown> {
  return { role: 'supporting', profile: Object.fromEntries(CHARACTER_FIELDS.map((f) => [f, ''])) };
}

export function newWorldFields(kind: WorldKind, parent?: string | null): Record<string, unknown> {
  const t = WORLD_TEMPLATES[kind];
  return { kind, parent: parent ?? undefined, profile: Object.fromEntries(t.fields.map((f) => [f, ''])) };
}
