import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journeysOf, pinsFor, pinsOf, serializeJourneys, serializePins, withoutPin, mimeFor } from '../src/model/maps';
import { MemoryFs } from '../src/fs/adapter';
import { loadProject, newProjectFiles, serializeDoc, docPath } from '../src/model/project';
import type { Doc } from '../src/model/types';

const map = (fields: Record<string, unknown>): Doc => ({ id: 'mp_test0001', kind: 'map', title: 'World', body: '', fields });

test('pins and journeys parse defensively and round-trip', () => {
  const d = map({
    pins: [{ id: 'pn_a', x: 0.25, y: '0.5', entity: 'wl_x0000001' }, { id: 'pn_b', x: 2, y: -1 }, 'junk', { x: 1 }],
    journeys: [{ id: 'jr_1', character: 'cr_m0000001', stops: [{ pin: 'pn_a' }, { pin: 'pn_b', scene: 'sc_1' }, {}] }],
  });
  const pins = pinsOf(d);
  assert.equal(pins.length, 2);
  assert.deepEqual(pins[1], { id: 'pn_b', x: 1, y: 0, label: undefined, entity: undefined }, 'clamped to the image');
  assert.equal(pins[0].y, 0.5);
  const js = journeysOf(d);
  assert.equal(js[0].stops.length, 2);
  const again = map({ pins: serializePins(pins), journeys: serializeJourneys(js) });
  assert.deepEqual(pinsOf(again), pins);
  assert.deepEqual(journeysOf(again), js);
});

test('removing a pin removes its journey stops', () => {
  const d = map({ pins: [{ id: 'pn_a', x: 0, y: 0 }, { id: 'pn_b', x: 1, y: 1 }], journeys: [{ id: 'jr_1', stops: [{ pin: 'pn_a' }, { pin: 'pn_b' }] }] });
  const patch = withoutPin(d, 'pn_a');
  assert.equal(patch.pins.length, 1);
  assert.deepEqual(patch.journeys[0].stops, [{ pin: 'pn_b', scene: undefined }]);
});

test('maps load from maps/ and pinsFor finds them', async () => {
  const fs = new MemoryFs(newProjectFiles('Book', 'novel'));
  const d = map({ image: 'assets/world.png', width: 2000, height: 1200, pins: [{ id: 'pn_a', x: 0.5, y: 0.5, entity: 'wl_town0001' }] });
  assert.ok(docPath(d.id).startsWith('maps/'));
  await fs.write(docPath(d.id), serializeDoc(d));
  const p = await loadProject(fs);
  assert.deepEqual(p.warnings, []);
  assert.equal(pinsFor(p.docs, 'wl_town0001').length, 1);
  assert.equal(mimeFor('assets/a.SVG'), 'image/svg+xml');
});
