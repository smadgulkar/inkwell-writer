import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../src/fs/adapter';
import { loadProject, newProjectFiles, serializeDoc, docPath, makeDoc } from '../src/model/project';
import { buildMentionIndex } from '../src/model/mentions';
import { mentionTerms, newCharacterFields, profileOf, arcOf, relationshipsOf, newWorldFields, worldKindOf } from '../src/model/entities';
import type { Doc } from '../src/model/types';

const scene = (id: string, body: string, fields: Record<string, unknown> = {}): Doc => ({ id, kind: 'scene', title: id, body, fields });

test('entities load from their own folders and keep custom fields', async () => {
  const fs = new MemoryFs(newProjectFiles('Book', 'novel'));
  const mara = makeDoc('character', 'Mara Venn', 'Born on the salt.', { ...newCharacterFields(), aliases: ['the Widow'], arc: { start: 'Alone', end: 'Leader', beats: [{ label: 'Betrayed', scene: 'sc_aaaa1111' }] } });
  const flats = makeDoc('world', 'The Salt Flats', '', newWorldFields('place'));
  await fs.write(docPath(mara.id), serializeDoc(mara));
  await fs.write(docPath(flats.id), serializeDoc(flats));
  assert.ok(docPath(mara.id).startsWith('characters/'));
  assert.ok(docPath(flats.id).startsWith('world/'));
  const p = await loadProject(fs);
  assert.deepEqual(p.warnings, []);
  const m = p.docs[mara.id];
  assert.equal(m.kind, 'character');
  assert.equal(profileOf(m)[0][0], 'Age');
  assert.equal(arcOf(m).beats?.[0].scene, 'sc_aaaa1111');
  assert.deepEqual(relationshipsOf(m), []);
  assert.equal(worldKindOf(p.docs[flats.id]), 'place');
  // Entities never land in the binder.
  assert.ok(!JSON.stringify(p.meta.binder).includes(mara.id));
});

test('mention terms include first name and aliases', () => {
  const d: Doc = { id: 'cr_aaaa1111', kind: 'character', title: 'Mara Venn', body: '', fields: { aliases: ['the Salt Widow'] } };
  assert.deepEqual(mentionTerms(d).sort(), ['Mara', 'Mara Venn', 'the Salt Widow', 'Salt Widow'].sort());
});

test('mention index finds links, names, POV and location', () => {
  const docs: Record<string, Doc> = {
    cr_mara0001: { id: 'cr_mara0001', kind: 'character', title: 'Mara Venn', body: '', fields: {} },
    cr_tess0001: { id: 'cr_tess0001', kind: 'character', title: 'Tess', body: '', fields: {} },
    wl_flat0001: { id: 'wl_flat0001', kind: 'world', title: 'Salt Flats', body: '', fields: { kind: 'place' } },
    sc_one00001: scene('sc_one00001', 'Mara saw [her](ink:cr_tess0001) on the roof. Mara waved.', { pov: 'cr_mara0001', location: 'wl_flat0001' }),
    sc_two00001: scene('sc_two00001', 'Tessa is not Tess. Marathon is not Mara.'),
  };
  const idx = buildMentionIndex(docs, ['sc_one00001', 'sc_two00001']);
  const mara = idx.byEntity.get('cr_mara0001')!;
  assert.equal(mara.length, 2);
  assert.deepEqual({ ...mara[0] }, { sceneId: 'sc_one00001', count: 2, linked: false, pov: true, location: false });
  assert.equal(mara[1].count, 1, 'whole-word match only');
  const tess = idx.byEntity.get('cr_tess0001')!;
  assert.equal(tess[0].linked, true);
  assert.equal(tess[1].count, 1, '"Tessa" is not a mention of Tess');
  assert.equal(idx.byEntity.get('wl_flat0001')![0].location, true);
  assert.deepEqual([...idx.byScene.get('sc_one00001')!].sort(), ['cr_mara0001', 'cr_tess0001', 'wl_flat0001']);
});

test('sample project loads cleanly and links resolve', async () => {
  const { demoFiles } = await import('../src/demo');
  const { sceneOrder } = await import('../src/model/binder');
  const fs = new MemoryFs(demoFiles().text);
  const p = await loadProject(fs);
  assert.deepEqual(p.warnings, []);
  for (const d of Object.values(p.docs)) {
    for (const m of d.body.matchAll(/\(ink:([a-z0-9_]+)\)/g)) assert.ok(p.docs[m[1]], `${d.id} links to missing ${m[1]}`);
    for (const k of ['pov', 'location', 'parent'] as const) if (typeof d.fields[k] === 'string') assert.ok(p.docs[d.fields[k] as string], `${d.id}.${k} missing`);
    for (const k of ['subplots', 'characters'] as const) for (const ref of (d.fields[k] as string[] | undefined) ?? []) assert.ok(p.docs[ref], `${d.id}.${k} -> ${ref} missing`);
    for (const ref of Object.keys((d.fields.beats as object | undefined) ?? {})) assert.ok((d.fields.subplots as string[]).includes(ref), `${d.id} beat for ${ref} without subplot`);
  }
  const idx = buildMentionIndex(p.docs, sceneOrder(p.meta.binder));
  assert.ok((idx.byEntity.get('cr_mara0001')?.length ?? 0) >= 2);
});
