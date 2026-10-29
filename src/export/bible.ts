// Story bible: characters, world and subplots as one reference document.
import { aliasesOf, arcOf, listField, profileOf, relationshipsOf, roleOf, ROLE_LABEL, worldKindOf, WORLD_TEMPLATES } from '../model/entities';
import { parseMarkdown, type Block, type Inline } from '../model/markdown';
import { WORLD_KINDS, type Doc, type Mode } from '../model/types';
import type { Compiled, Section } from './compile';

const p = (...inl: Inline[]): Block => ({ type: 'p', inlines: inl });
const field = (k: string, v: string): Block => p({ text: `${k}: `, b: true }, { text: v });
const sub = (t: string): Block => ({ type: 'h3', inlines: [{ text: t }] });
const plain = (md: string): Block[] => parseMarkdown(md).map((b) => ({ ...b, inlines: b.inlines.map(({ link: _l, ...r }) => r as Inline) }));

export function compileBible(meta: { title: string; author?: string; mode: Mode }, docs: Record<string, Doc>, opts: { characters: boolean; world: boolean; subplots: boolean } = { characters: true, world: true, subplots: true }): Compiled {
  const all = Object.values(docs);
  const byTitle = (a: Doc, b: Doc) => (a.title || '').localeCompare(b.title || '');
  const sections: Section[] = [];
  const title = (id: string) => docs[id]?.title || 'someone';

  if (opts.characters) {
    const cast = all.filter((d) => d.kind === 'character');
    const order = ['protagonist', 'antagonist', 'supporting', 'minor'];
    cast.sort((a, b) => order.indexOf(roleOf(a)) - order.indexOf(roleOf(b)) || byTitle(a, b));
    if (cast.length) sections.push({ kind: 'part', id: null, label: null, title: 'Characters', blocks: [] });
    for (const d of cast) {
      const blocks: Block[] = [];
      const aliases = aliasesOf(d);
      if (aliases.length) blocks.push(field('Also called', aliases.join(', ')));
      for (const [k, v] of profileOf(d)) if (v.trim()) blocks.push(field(k, v));
      const arc = arcOf(d);
      if (arc.start || arc.end || arc.beats?.length) {
        blocks.push(sub('Arc'));
        if (arc.start) blocks.push(field('Begins', arc.start));
        for (const b of arc.beats ?? []) if (b.label) blocks.push(p({ text: '— ' }, { text: b.label }));
        if (arc.end) blocks.push(field('Ends', arc.end));
      }
      const rels = relationshipsOf(d).filter((r) => docs[r.to]);
      if (rels.length) {
        blocks.push(sub('Relationships'));
        for (const r of rels) blocks.push(p({ text: title(r.to), b: true }, { text: [r.kind, r.note].filter(Boolean).length ? ` — ${[r.kind, r.note].filter(Boolean).join('. ')}` : '' }));
      }
      const body = plain(d.body);
      if (body.length) blocks.push(sub('Notes'), ...body);
      sections.push({ kind: 'chapter', id: d.id, label: ROLE_LABEL[roleOf(d)], title: d.title || 'Unnamed', blocks: blocks.length ? blocks : [p({ text: 'No details yet.', i: true })] });
    }
  }

  if (opts.world) {
    const entries = all.filter((d) => d.kind === 'world');
    for (const kind of WORLD_KINDS) {
      const group = entries.filter((d) => worldKindOf(d) === kind).sort(byTitle);
      if (!group.length) continue;
      sections.push({ kind: 'part', id: null, label: null, title: WORLD_TEMPLATES[kind].plural, blocks: [] });
      for (const d of group) {
        const blocks: Block[] = [];
        const parent = typeof d.fields.parent === 'string' && docs[d.fields.parent] ? docs[d.fields.parent].title : null;
        if (parent) blocks.push(field('Part of', parent));
        for (const [k, v] of profileOf(d)) if (v.trim()) blocks.push(field(k, v));
        for (const [key, label] of [['rules', 'Rules'], ['costs', 'Costs'], ['limits', 'Limits']] as const) {
          const list = listField(d, key);
          if (list.length) blocks.push(sub(label), ...list.map((x) => p({ text: '— ' }, { text: x })));
        }
        const body = plain(d.body);
        if (body.length) blocks.push(...(blocks.length ? [sub('Notes')] : []), ...body);
        sections.push({ kind: 'chapter', id: d.id, label: WORLD_TEMPLATES[kind].label, title: d.title || 'Untitled', blocks: blocks.length ? blocks : [p({ text: 'No details yet.', i: true })] });
      }
    }
  }

  if (opts.subplots) {
    const subs = all.filter((d) => d.kind === 'subplot').sort(byTitle);
    if (subs.length) sections.push({ kind: 'part', id: null, label: null, title: 'Subplots', blocks: [] });
    for (const d of subs) {
      const blocks: Block[] = [];
      if (typeof d.fields.status === 'string' && d.fields.status) blocks.push(field('Status', d.fields.status));
      const who = Array.isArray(d.fields.characters) ? (d.fields.characters as unknown[]).filter((x): x is string => typeof x === 'string' && !!docs[x]).map(title) : [];
      if (who.length) blocks.push(field('Characters', who.join(', ')));
      blocks.push(...plain(d.body));
      sections.push({ kind: 'chapter', id: d.id, label: 'Subplot', title: d.title || 'Untitled', blocks: blocks.length ? blocks : [p({ text: 'No details yet.', i: true })] });
    }
  }

  return { title: `${meta.title}: Story Bible`, author: meta.author ?? '', mode: meta.mode, sections, words: 0, scenes: 0, reference: true };
}
