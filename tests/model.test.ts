import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, serializeMarkdown, parseInline, serializeInline, normalize, type Inline, type Block } from '../src/model/markdown';
import { parseFrontmatter, stringifyFrontmatter } from '../src/model/frontmatter';
import { moveNode, canDrop, placementFor, sceneOrder, removeNode } from '../src/model/binder';
import { loadProject, newProjectFiles, serializeDoc, parseDoc, META_FILE, docPath } from '../src/model/project';
import { MemoryFs } from '../src/fs/adapter';
import { countMarkdown, lengthBand } from '../src/model/words';

test('markdown: basic blocks round-trip', () => {
  const md = [
    'The train left before [Mara](ink:cr_7m2kd9sa) had found her ticket.',
    '## A heading',
    '> A quoted line',
    '***',
    'She said, **no**, *never*, ~~maybe~~.',
    '***bold italic*** end',
  ].join('\n\n');
  const blocks = parseMarkdown(md);
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'h2', 'quote', 'break', 'p', 'p']);
  assert.equal(blocks[0].inlines[1].link, 'cr_7m2kd9sa');
  assert.equal(serializeMarkdown(blocks), md);
});

test('markdown: escapes survive', () => {
  const runs: Inline[] = [{ text: 'Use *stars* and _under_scores_ [brackets] \\ back' }];
  const md = serializeInline(runs);
  assert.deepEqual(parseInline(md), runs);
});

test('markdown: paragraphs that look like syntax are escaped', () => {
  const blocks: Block[] = [
    { type: 'p', inlines: [{ text: '# not a heading' }] },
    { type: 'p', inlines: [{ text: '> not a quote' }] },
    { type: 'p', inlines: [{ text: '***' }] },
  ];
  assert.deepEqual(parseMarkdown(serializeMarkdown(blocks)), blocks);
});

test('markdown: nested styles round-trip', () => {
  const runs: Inline[] = [
    { text: 'plain ' },
    { text: 'bold ', b: true },
    { text: 'bold-italic', b: true, i: true },
    { text: ' italic', i: true },
    { text: ' link', link: 'sc_abcdefgh' },
    { text: 'strike', s: true },
  ];
  assert.deepEqual(parseInline(serializeInline(runs)), runs);
});

test('markdown: fuzz round-trip is stable', () => {
  const words = ['the', 'salt', 'road', '*', '_', 'Mara', '~', '[x]', 'it’s', '#', 'a\\b'];
  let seed = 42;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
  for (let iter = 0; iter < 400; iter++) {
    const runs: Inline[] = [];
    const n = 1 + rnd(6);
    for (let i = 0; i < n; i++) {
      const text = Array.from({ length: 1 + rnd(4) }, () => words[rnd(words.length)]).join(' ') + (rnd(2) ? ' ' : '');
      runs.push({ text, ...(rnd(3) === 0 && { b: true }), ...(rnd(3) === 0 && { i: true }), ...(rnd(5) === 0 && { s: true }) });
    }
    const blocks: Block[] = [{ type: 'p', inlines: runs }];
    const md1 = serializeMarkdown(blocks);
    const md2 = serializeMarkdown(parseMarkdown(md1));
    assert.equal(md2, md1, `unstable for ${JSON.stringify(runs)}`);
    // Styles survive exactly (paragraph-edge whitespace aside).
    const edge = (rs: Inline[]) => {
      const t = normalize(rs.map((r) => ({ ...r })));
      if (t.length) {
        t[0].text = t[0].text.trimStart();
        t[t.length - 1].text = t[t.length - 1].text.trimEnd();
      }
      return normalize(t);
    };
    assert.deepEqual(edge(parseMarkdown(md1)[0]?.inlines ?? []), edge(runs), `styles lost for ${JSON.stringify(runs)}`);
    // Text content is never lost.
    const text = (b: Block[]) => b.map((x) => x.inlines.map((r) => r.text).join('')).join('').replace(/\s+/g, ' ').trim();
    assert.equal(text(parseMarkdown(md1)), text(blocks));
  }
});

test('frontmatter: parse and stringify', () => {
  const src = '---\nid: sc_k3f9a2qx\ntitle: The Station\ntags: [a, b]\n---\n\nHello.\n';
  const { data, body } = parseFrontmatter(src);
  assert.equal(data.title, 'The Station');
  assert.deepEqual(data.tags, ['a', 'b']);
  assert.equal(body, 'Hello.\n');
  const out = stringifyFrontmatter(data, body);
  assert.deepEqual(parseFrontmatter(out), { data, body: 'Hello.\n' });
});

test('doc: unknown fields survive and output is byte-stable', () => {
  const src = '---\nid: sc_k3f9a2qx\ntype: scene\ntitle: "The Station: Part 1"\nstatus: draft\ncustom: keep me\n---\n\nText.\n';
  const doc = parseDoc(src);
  assert.equal(doc.fields.custom, 'keep me');
  const once = serializeDoc(doc);
  assert.equal(serializeDoc(parseDoc(once)), once);
});

test('binder: move rules', () => {
  const tree = [
    { id: 'pt_aaaa1111', children: [{ id: 'ch_aaaa1111', children: [{ id: 'sc_aaaa1111' }, { id: 'sc_bbbb2222' }] }] },
    { id: 'ch_bbbb2222', children: [] },
  ];
  assert.equal(canDrop(tree, 'ch_bbbb2222', 'sc_aaaa1111', 'inside'), false, 'chapter cannot go in a scene');
  assert.equal(canDrop(tree, 'pt_aaaa1111', 'sc_aaaa1111', 'before'), false, 'part cannot go in a chapter');
  assert.equal(canDrop(tree, 'pt_aaaa1111', 'ch_aaaa1111', 'inside'), false, 'cannot drop into own child');
  const moved = moveNode(tree, 'sc_bbbb2222', 'ch_bbbb2222', 'inside');
  assert.deepEqual(sceneOrder(moved), ['sc_aaaa1111', 'sc_bbbb2222']);
  assert.deepEqual(moved[1], { id: 'ch_bbbb2222', children: [{ id: 'sc_bbbb2222' }] });
  const reordered = moveNode(tree, 'sc_bbbb2222', 'sc_aaaa1111', 'before');
  assert.deepEqual(sceneOrder(reordered), ['sc_bbbb2222', 'sc_aaaa1111']);
  assert.deepEqual(placementFor(tree, 'scene', 'sc_aaaa1111'), { targetId: 'sc_aaaa1111', pos: 'after' });
  assert.deepEqual(placementFor(tree, 'chapter', 'sc_aaaa1111'), { targetId: 'ch_aaaa1111', pos: 'after' });
  assert.deepEqual(placementFor(tree, 'scene', 'ch_bbbb2222'), { targetId: 'ch_bbbb2222', pos: 'inside' });
  assert.equal(removeNode(tree, 'ch_aaaa1111').node?.children?.length, 2);
});

test('project: create, load, reconcile', async () => {
  const fs = new MemoryFs(newProjectFiles('The Salt Road', 'novel'));
  const p = await loadProject(fs);
  assert.equal(p.meta.title, 'The Salt Road');
  assert.equal(Object.keys(p.docs).length, 2);
  assert.deepEqual(p.warnings, []);
  // An orphan file is added to the binder; a missing file is pruned.
  await fs.write(docPath('sc_orphan01'), '---\nid: sc_orphan01\ntitle: Lost\n---\n');
  p.meta.binder.push({ id: 'sc_missing1' });
  await fs.write(META_FILE, (await import('../src/model/project')).serializeMeta(p.meta));
  const p2 = await loadProject(fs);
  assert.ok(p2.meta.binder.some((n) => n.id === 'sc_orphan01'));
  assert.ok(!p2.meta.binder.some((n) => n.id === 'sc_missing1'));
  assert.equal(p2.warnings.length, 2);
});

test('words', () => {
  assert.equal(countMarkdown("It's a **well-known** [Mara](ink:cr_x1234567) story.\n\n***\n\nTwo"), 6);
  assert.equal(lengthBand(900).name, 'Flash fiction');
  assert.equal(lengthBand(8000).name, 'Novelette');
});
