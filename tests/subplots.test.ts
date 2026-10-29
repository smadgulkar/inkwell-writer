import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSubplots, sceneGroups, toggleSubplotPatch, beatPatch, sceneSubplots, beatsOf } from '../src/model/subplots';
import type { BinderNode, Doc } from '../src/model/types';

function book(chapters: number, scenesPer = 1) {
  const docs: Record<string, Doc> = {};
  const binder: BinderNode[] = [];
  for (let c = 0; c < chapters; c++) {
    const cid = `ch_c${String(c).padStart(6, '0')}`;
    docs[cid] = { id: cid, kind: 'chapter', title: `Chapter ${c + 1}`, body: '', fields: {} };
    const kids: BinderNode[] = [];
    for (let s = 0; s < scenesPer; s++) {
      const sid = `sc_c${String(c).padStart(2, "0")}s${s}000`;
      docs[sid] = { id: sid, kind: 'scene', title: `S${c}.${s}`, body: '', fields: {} };
      kids.push({ id: sid });
    }
    binder.push({ id: cid, children: kids });
  }
  return { docs, binder };
}

test('scene groups follow chapters and collect loose scenes', () => {
  const docs: Record<string, Doc> = {
    pt_p0000001: { id: 'pt_p0000001', kind: 'part', title: 'Part', body: '', fields: {} },
    ch_a0000001: { id: 'ch_a0000001', kind: 'chapter', title: 'A', body: '', fields: {} },
    sc_a0000001: { id: 'sc_a0000001', kind: 'scene', title: 'a', body: '', fields: {} },
    sc_l0000001: { id: 'sc_l0000001', kind: 'scene', title: 'loose', body: '', fields: {} },
    sc_r0000001: { id: 'sc_r0000001', kind: 'scene', title: 'root', body: '', fields: {} },
  };
  const binder = [{ id: 'pt_p0000001', children: [{ id: 'ch_a0000001', children: [{ id: 'sc_a0000001' }] }, { id: 'sc_l0000001' }] }, { id: 'sc_r0000001' }];
  const g = sceneGroups(binder, docs);
  assert.deepEqual(
    g.map((x) => [x.id, x.scenes]),
    [
      ['ch_a0000001', ['sc_a0000001']],
      ['pt_p0000001', ['sc_l0000001']],
      [null, ['sc_r0000001']],
    ],
  );
});

test('toggling subplots and beat notes', () => {
  let scene: Doc = { id: 'sc_x0000001', kind: 'scene', title: 'x', body: '', fields: {} };
  scene = { ...scene, fields: { ...scene.fields, ...toggleSubplotPatch(scene, 'sp_a0000001', true) } };
  scene = { ...scene, fields: { ...scene.fields, ...beatPatch(scene, 'sp_a0000001', 'Oren’s name appears') } };
  assert.deepEqual(sceneSubplots(scene), ['sp_a0000001']);
  assert.equal(beatsOf(scene).sp_a0000001, 'Oren’s name appears');
  scene = { ...scene, fields: { ...scene.fields, ...toggleSubplotPatch(scene, 'sp_a0000001', false) } };
  assert.deepEqual(sceneSubplots(scene), []);
  assert.equal(scene.fields.beats, undefined, 'beat note removed with the subplot');
});

test('gap and unresolved warnings', () => {
  const { docs, binder } = book(12);
  docs.sp_mys00001 = { id: 'sp_mys00001', kind: 'subplot', title: 'Mystery', body: '', fields: { status: 'rising' } };
  docs.sp_rom00001 = { id: 'sp_rom00001', kind: 'subplot', title: 'Romance', body: '', fields: { status: 'resolved' } };
  docs.sp_new00001 = { id: 'sp_new00001', kind: 'subplot', title: 'Unused', body: '', fields: {} };
  const scenes = Object.keys(docs).filter((k) => k.startsWith('sc_')).sort();
  const tag = (i: number, sp: string) => (docs[scenes[i]].fields = { subplots: [...((docs[scenes[i]].fields.subplots as string[]) ?? []), sp] });
  // Mystery: chapters 1, 2, then 9 (6 missing), then nothing for the last 3 chapters (under threshold) but unresolved.
  tag(0, 'sp_mys00001');
  tag(1, 'sp_mys00001');
  tag(8, 'sp_mys00001');
  // Romance: chapters 1 and 2, resolved: no tail warning.
  tag(0, 'sp_rom00001');
  tag(1, 'sp_rom00001');
  const a = analyzeSubplots(binder, docs);
  const mys = a.get('sp_mys00001')!;
  assert.deepEqual(mys.chapters, [0, 1, 8]);
  assert.deepEqual(
    mys.warnings.map((w) => w.kind),
    ['gap', 'unresolved'],
  );
  assert.equal((mys.warnings[0] as { chapters: number }).chapters, 6);
  assert.deepEqual(a.get('sp_rom00001')!.warnings, []);
  assert.deepEqual(a.get('sp_new00001')!.warnings, [{ kind: 'unused' }]);
  // An open thread that disappears for the last 10 chapters gets a tail gap warning.
  docs.sp_mys00001.fields.status = 'setup';
  docs[scenes[8]].fields = {};
  const b = analyzeSubplots(binder, docs).get('sp_mys00001')!;
  assert.equal(b.warnings[0].kind, 'gap');
  assert.equal((b.warnings[0] as { chapters: number }).chapters, 10);
});
