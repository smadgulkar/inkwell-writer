import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../src/model/timeline';
import { GREGORIAN } from '../src/model/calendar';
import { diffText, diffStats } from '../src/model/diff';
import type { Doc } from '../src/model/types';

test('timeline merges events and dated scenes in order', () => {
  const docs: Record<string, Doc> = {
    ev_war00001: { id: 'ev_war00001', kind: 'event', title: 'The Salt War', body: '', fields: { date: '1850', end: '1856', scope: 'world', entities: ['cr_x', 'wl_gone'] } },
    ev_born0001: { id: 'ev_born0001', kind: 'event', title: 'Mara is born', body: '', fields: { date: '1858-4-2', scope: 'story' } },
    ev_nodate01: { id: 'ev_nodate01', kind: 'event', title: 'Someday', body: '', fields: {} },
    cr_x: { id: 'cr_x', kind: 'character', title: 'X', body: '', fields: {} },
    sc_a0000001: { id: 'sc_a0000001', kind: 'scene', title: 'Arrival', body: '', fields: { storyDate: '1892-9-1', pov: 'cr_x' } },
    sc_b0000001: { id: 'sc_b0000001', kind: 'scene', title: 'Flashback', body: '', fields: { storyDate: '1858' } },
    sc_c0000001: { id: 'sc_c0000001', kind: 'scene', title: 'No date', body: '', fields: {} },
  };
  const binder = [{ id: 'sc_a0000001' }, { id: 'sc_b0000001' }, { id: 'sc_c0000001' }];
  const { items, undated } = buildTimeline(docs, binder, GREGORIAN);
  assert.deepEqual(items.map((i) => i.title), ['The Salt War', 'Flashback', 'Mara is born', 'Arrival']);
  assert.deepEqual(items[0].entities, ['cr_x'], 'missing entries dropped');
  assert.equal(items[0].end?.year, 1856);
  assert.deepEqual(items[3].entities, ['cr_x'], 'scene POV counts as involved');
  assert.deepEqual(undated.map((d) => d.title), ['Someday']);
});

test('word diff', () => {
  const ops = diffText('The train left.\n\nShe stood alone on the platform.', 'The train left.\n\nShe stood quite alone on the empty platform.\n\nNight fell.');
  assert.equal(ops.length, 3);
  assert.deepEqual(ops[0], [{ t: 'same', s: 'The train left.' }]);
  const added = ops[1].filter((o) => o.t === 'add').map((o) => o.s.trim());
  assert.deepEqual(added, ['quite', 'empty']);
  assert.deepEqual(ops[2], [{ t: 'add', s: 'Night fell.' }]);
  assert.deepEqual(diffStats(ops), { added: 4, removed: 0 });
});
