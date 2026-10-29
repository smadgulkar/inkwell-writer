import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoFiles } from '../src/demo';
import { parseDoc, parseMeta } from '../src/model/project';
import { buildMentionIndex } from '../src/model/mentions';
import { sceneOrder } from '../src/model/binder';
import { detectLinks, guessType, ideaOf, ideaTitle, relatedIdeas, suggestPlacements, type Idea } from '../src/model/ideas';
import type { Doc } from '../src/model/types';

function demo() {
  const f = demoFiles().text;
  const meta = parseMeta(f['project.yaml']);
  const docs: Record<string, Doc> = {};
  for (const [k, v] of Object.entries(f)) if (k.endsWith('.md')) {
    const d = parseDoc(v);
    docs[d.id] = d;
  }
  return { meta, docs, index: buildMentionIndex(docs, sceneOrder(meta.binder)) };
}
const idea = (text: string, extra: Partial<Idea> = {}): Idea => ({ id: 'id_test0001', title: ideaTitle(text), text, type: 'other', typeAuto: true, status: 'new', links: [], unlinked: [], target: null, usedIn: null, created: '', ...extra });

test('titles', () => {
  assert.equal(ideaTitle('What if Tess wrote the letters herself? That would change everything.'), 'What if Tess wrote the letters herself?');
  assert.ok(ideaTitle('a'.repeat(30) + ' ' + 'b'.repeat(60)).endsWith('…'));
});

test('type guesses', () => {
  const g = (t: string) => guessType(t).type;
  assert.equal(g('What if the stranger turns out to be Oren? Big twist at the midpoint.'), 'plot');
  assert.equal(g('“You don’t get to be sorry, Mara. Not today.”'), 'line');
  assert.equal(g('A salt temple in the mountains where the river disappears underground.'), 'place');
  assert.equal(g('The Guild war, two centuries ago, emptied the coast.'), 'event');
  assert.equal(g('Her childhood: she grew up mending nets; her mother never forgave her.'), 'character');
  assert.equal(g('#scene they argue over dinner'), 'scene');
  assert.equal(g('The story is really about grief and forgiveness.'), 'theme');
  assert.equal(g('buy milk').type ?? g('buy milk'), 'other');
});

test('links by name, alias, first name and title', () => {
  const { docs } = demo();
  const ids = detectLinks('Mara should find the ledger before Tess does, somewhere out on the Salt Flats.', docs);
  const titles = ids.map((id) => docs[id].title);
  assert.ok(titles.includes('Mara Venn'), titles.join());
  assert.ok(titles.includes('Tess'));
  assert.ok(titles.includes('The Salt Flats'));
  assert.ok(!detectLinks('tess is lowercase here', docs).length, 'names are case-sensitive');
});

test('placement suggests the scene where the people already are', () => {
  const { meta, docs, index } = demo();
  const p = suggestPlacements(idea('Tess should notice Mara hiding the letter and say nothing.'), docs, meta.binder, index);
  assert.ok(p.length > 0);
  assert.ok(p[0].why.length > 0);
  const top = docs[p[0].id];
  assert.equal(top.kind, 'scene');
});

test('related ideas share people or words', () => {
  const { docs } = demo();
  const a = idea('Tess lies about the ledger.', { id: 'id_a0000001' });
  const b = idea('Tess was the one who sold the ledger.', { id: 'id_b0000001' });
  const c = idea('Rain festival in spring.', { id: 'id_c0000001' });
  const r = relatedIdeas(a, [a, b, c], docs);
  assert.deepEqual(r.map((x) => x.id), ['id_b0000001']);
});

test('ideaOf reads files defensively', () => {
  const i = ideaOf({ id: 'id_x0000001', kind: 'idea', title: 'T', body: 'x', fields: { ideaType: 'nonsense', links: ['cr_a', 3] } });
  assert.equal(i.type, 'other');
  assert.deepEqual(i.links, ['cr_a']);
  assert.equal(i.status, 'new');
});

test('store: capture, sort, use as a scene, add to a character', async () => {
  const { MemoryFs } = await import('../src/fs/adapter');
  const { store } = await import('../src/store/store');
  const { newProjectFiles } = await import('../src/model/project');
  await store.open(new MemoryFs(newProjectFiles('Ideas', 'novel')));
  const tess = store.addCharacter('Tess', {}, { select: false })!;
  const id = store.addIdea('What if Tess turns out to be the letter writer? Big twist.')!;
  let doc = store.get().project!.docs[id];
  assert.equal(doc.fields.ideaType, 'plot');
  assert.equal(doc.title, 'What if Tess turns out to be the letter writer?');
  store.editIdeaText(id, 'Tess grew up in Brine; her mother ran the inn.');
  doc = store.get().project!.docs[id];
  assert.equal(doc.fields.ideaType, 'character', 'type follows the text until chosen by hand');
  store.setIdeaType(id, 'scene');
  store.editIdeaText(id, 'Tess grew up in Brine; her mother ran the inn. More.');
  assert.equal(store.get().project!.docs[id].fields.ideaType, 'scene', 'a chosen type sticks');

  const scene = store.useIdea(id, 'scene')!;
  const p = store.get().project!;
  assert.equal(p.docs[scene].kind, 'scene');
  assert.match(String(p.docs[scene].fields.synopsis), /Tess grew up/);
  assert.equal(p.docs[id].fields.status, 'used');
  assert.equal(p.docs[id].fields.usedIn, scene);

  const id2 = store.addIdea('Tess is afraid of open water.')!;
  store.addIdeaTo(id2, tess);
  assert.match(store.get().project!.docs[tess].body, /afraid of open water/);
  await store.flush();
});

test('assistant: parses a tool reply and drops ids that do not exist', async () => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
  const { askClaude, assistant } = await import('../src/ideas/ai');
  const { docs, meta } = demo();
  assistant.setKey('sk-ant-test');
  let sent: { headers: Record<string, string>; body: string } | null = null;
  const fakeFetch = (async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    sent = init;
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'sort_idea', input: { type: 'plot', title: 'The stranger', links: ['cr_mara0001', 'cr_nobody99'], target: 'sc_stranger', why: 'He arrives here.', questions: ['What does he want?'] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await askClaude('The stranger knew Oren.', docs, meta.binder, { fetchImpl: fakeFetch });
  assert.equal(r.type, 'plot');
  assert.deepEqual(r.links, ['cr_mara0001']);
  assert.equal(r.target, 'sc_stranger');
  assert.equal(sent!.headers['x-api-key'], 'sk-ant-test');
  assert.match(sent!.body, /sc_stranger/, 'project context sent');
  const bad = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(askClaude('x', docs, meta.binder, { fetchImpl: bad }), /not accepted/);
});

test('titles keep quotations whole', () => {
  assert.equal(ideaTitle('“You don’t get to be sorry, Mara. Not out here.”'), '“You don’t get to be sorry, Mara. Not out here.”');
});
