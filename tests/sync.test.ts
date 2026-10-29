import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../src/fs/adapter';
import { conflictLabel, docPath, loadProject, newProjectFiles, parseDoc, serializeDoc } from '../src/model/project';
import { sceneOrder } from '../src/model/binder';
import { store } from '../src/store/store';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function projectWithScene() {
  const files = newProjectFiles('Sync', 'novel');
  const fs = new MemoryFs(files);
  return { fs, files };
}

test('labels for sync services', () => {
  assert.equal(conflictLabel(" (Jane Doe's conflicted copy 2026-10-01)"), 'Jane Doe’s conflicted copy');
  assert.equal(conflictLabel('.sync-conflict-20261001-101010-ABCDEFG'), 'A Syncthing conflict copy');
  assert.equal(conflictLabel(' (1)'), 'A duplicate copy');
  assert.equal(conflictLabel('-DESKTOP-7Q2'), 'A copy from DESKTOP-7Q2');
});

test('loader keeps the canonical file and reports copies, whatever the listing order', async () => {
  const { fs } = projectWithScene();
  const p0 = await loadProject(fs);
  const id = sceneOrder(p0.meta.binder)[0];
  const real = parseDoc((await fs.read(docPath(id)))!);
  await fs.write(docPath(id), serializeDoc({ ...real, body: 'The real one.' }));
  // "(1)" sorts before ".md", the trap the old loader fell into.
  await fs.write(`manuscript/${id} (1).md`, serializeDoc({ ...real, body: 'The copy.' }));
  const p = await loadProject(fs);
  assert.equal(p.docs[id].body, 'The real one.');
  assert.equal(p.conflicts.length, 1);
  assert.equal(p.conflicts[0].doc.body, 'The copy.');
  assert.equal(p.conflicts[0].label, 'A duplicate copy');
});

test('a copy with no original is recovered', async () => {
  const { fs } = projectWithScene();
  const p0 = await loadProject(fs);
  const id = sceneOrder(p0.meta.binder)[0];
  const text = (await fs.read(docPath(id)))!;
  await fs.remove(docPath(id));
  await fs.write(`manuscript/${id}-LAPTOP.md`, text);
  const p = await loadProject(fs);
  assert.ok(p.docs[id]);
  assert.equal(p.conflicts.length, 0);
  assert.ok(p.warnings.some((w) => w.startsWith('Recovered')));
});

test('store: identical copies are cleaned up, different ones resolved three ways', async () => {
  const { fs } = projectWithScene();
  const p0 = await loadProject(fs);
  const id = sceneOrder(p0.meta.binder)[0];
  const real = parseDoc((await fs.read(docPath(id)))!);
  await fs.write(docPath(id), serializeDoc({ ...real, body: 'Mine.' }));
  await fs.write(`manuscript/${id} (copy).md`, serializeDoc({ ...real, body: 'Mine.' }));
  await fs.write(`manuscript/${id} (Ann's conflicted copy).md`, serializeDoc({ ...real, body: 'Theirs.' }));
  await store.open(fs);
  assert.equal(await fs.read(`manuscript/${id} (copy).md`), null, 'identical copy removed');
  assert.equal(store.get().conflicts.length, 1);

  await store.resolveConflict(store.get().conflicts[0], 'theirs');
  assert.equal(store.get().project!.docs[id].body, 'Theirs.');
  assert.equal(await fs.read(`manuscript/${id} (Ann's conflicted copy).md`), null);
  const snaps = await store.listSnapshots(id);
  assert.equal(snaps[0].body, 'Mine.', 'my version kept as a snapshot');

  await fs.write(`manuscript/${id} (2).md`, serializeDoc({ ...real, body: 'A third.' }));
  await store.flush();
  await store.checkExternal();
  assert.equal(store.get().conflicts.length, 1, 'new copies found while open');
  await store.resolveConflict(store.get().conflicts[0], 'both');
  const order = sceneOrder(store.get().project!.meta.binder);
  const twin = order[order.indexOf(id) + 1];
  assert.equal(store.get().project!.docs[twin].body, 'A third.');
  assert.match(store.get().project!.docs[twin].title, /other version/);
});

test('store: edits from another device are picked up; racing edits become conflicts', async () => {
  const { fs } = projectWithScene();
  await store.open(fs);
  const id = sceneOrder(store.get().project!.meta.binder)[0];
  store.updateDoc(id, { body: 'Local text.' });
  await store.flush();
  // Another device rewrites the file.
  const d = parseDoc((await fs.read(docPath(id)))!);
  await fs.write(docPath(id), serializeDoc({ ...d, body: 'Written on the laptop.' }));
  const rev = store.get().externalRev;
  assert.equal(await store.checkExternal(), 1);
  assert.equal(store.get().project!.docs[id].body, 'Written on the laptop.');
  assert.ok(store.get().externalRev > rev, 'editor told to reload');

  // Now both sides change before a save.
  await fs.write(docPath(id), serializeDoc({ ...d, body: 'Phone edit.' }));
  store.updateDoc(id, { body: 'Desk edit, unsaved.' });
  await store.checkExternal();
  assert.equal(store.get().project!.docs[id].body, 'Desk edit, unsaved.', 'typing is never overwritten');
  const c = store.get().conflicts.find((x) => x.id === id && !x.path);
  assert.ok(c, 'other version offered');
  assert.equal(c!.doc.body, 'Phone edit.');
  await store.resolveConflict(c!, 'mine');
  await store.flush();
  assert.match((await fs.read(docPath(id)))!, /Desk edit, unsaved\./);
  await tick();
});

test('diff cleanup groups rewritten phrases', async () => {
  const { diffText } = await import('../src/model/diff');
  const [p] = diffText('which was a kind of answer in itself.', 'which felt like an answer.');
  assert.deepEqual(p.map((o) => o.t), ['same', 'del', 'add']);
  const [q] = diffText('She walked to the red door.', 'She ran to the blue door.');
  assert.equal(q.filter((o) => o.t === 'del').length, 2, 'separate edits stay separate');
});
