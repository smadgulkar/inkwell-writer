import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../src/fs/adapter';
import { newProjectFiles, STATS_FILE } from '../src/model/project';
import { sceneOrder } from '../src/model/binder';
import { store, dayKey } from '../src/store/store';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test('snapshots: automatic first-edit copy, named snapshots, restore', async () => {
  const fs = new MemoryFs(newProjectFiles('History', 'novel'));
  await store.open(fs);
  const id = sceneOrder(store.get().project!.meta.binder)[0];
  store.updateDoc(id, { body: 'First draft of the opening.' });
  await store.flush();
  // The scene was empty before, so there is nothing to protect yet.
  assert.equal((await store.listSnapshots(id)).length, 0);

  store.updateDoc(id, { body: 'Second draft of the opening.' });
  await tick();
  let snaps = await store.listSnapshots(id);
  assert.equal(snaps.length, 1, 'first change of a non-empty scene keeps a copy');
  assert.equal(snaps[0].body, 'First draft of the opening.');
  assert.equal(snaps[0].reason, 'Start of the day');

  store.updateDoc(id, { body: 'Third draft.' });
  await tick();
  assert.equal((await store.listSnapshots(id)).length, 1, 'only once a day');

  await store.takeSnapshot(id, { name: 'Before rewrite' });
  snaps = await store.listSnapshots(id);
  assert.equal(snaps.length, 2);
  assert.equal(snaps[0].name, 'Before rewrite', 'newest first');

  const old = snaps.find((s) => s.reason === 'Start of the day')!;
  await store.restoreSnapshot(id, old);
  assert.equal(store.get().project!.docs[id].body, 'First draft of the opening.');
  assert.equal((await store.listSnapshots(id)).length, 3, 'restoring keeps a copy of what it replaced');
  await store.flush();
});

test('word history is saved in the project', async () => {
  const fs = new MemoryFs(newProjectFiles('Stats', 'novel'));
  await store.open(fs);
  const id = sceneOrder(store.get().project!.meta.binder)[0];
  store.updateDoc(id, { body: 'one two three four five' });
  await store.flush();
  const stats = JSON.parse((await fs.read(STATS_FILE))!);
  assert.deepEqual(stats.days[dayKey()], { start: 0, end: 5 });
});

test('trash restore brings a scene back', async () => {
  const fs = new MemoryFs(newProjectFiles('Trash', 'novel'));
  await store.open(fs);
  const id = sceneOrder(store.get().project!.meta.binder)[0];
  store.updateDoc(id, { title: 'Keep me', body: 'Words.' });
  await store.flush();
  await store.remove(id);
  assert.equal(store.get().project!.docs[id], undefined);
  const trash = await store.listTrash();
  assert.equal(trash.length, 1);
  await store.restoreFromTrash(trash[0]);
  assert.equal(store.get().project!.docs[id].title, 'Keep me');
  assert.ok(sceneOrder(store.get().project!.meta.binder).includes(id));
  assert.equal((await store.listTrash()).length, 0);
  await store.close();
});
