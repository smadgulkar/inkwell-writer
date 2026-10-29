// Performance gates from the spec: a long novel must open, count and export quickly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../src/fs/adapter';
import { loadProject, makeDoc, serializeDoc, serializeMeta, docPath } from '../src/model/project';
import { compile, DEFAULT_EXPORT } from '../src/export/compile';
import { buildDocx } from '../src/export/docx';
import { buildEpub } from '../src/export/book';
import { countMarkdown } from '../src/model/words';
import { parseMarkdown, serializeMarkdown } from '../src/model/markdown';
import type { BinderNode } from '../src/model/types';

const WORDS = 'the salt road ran east across the flats and nobody who walked it came back quite the same as they had been before'.split(' ');

function bigNovel(chapters = 60, scenesPer = 5, wordsPerScene = 500) {
  const files: Record<string, string> = {};
  const binder: BinderNode[] = [];
  let w = 0;
  for (let c = 0; c < chapters; c++) {
    const ch = makeDoc('chapter', `Chapter ${c + 1}`);
    files[docPath(ch.id)] = serializeDoc(ch);
    const node: BinderNode = { id: ch.id, children: [] };
    for (let s = 0; s < scenesPer; s++) {
      const paras: string[] = [];
      let n = 0;
      while (n < wordsPerScene) {
        const len = 40 + ((n * 7) % 60);
        const p: string[] = [];
        for (let k = 0; k < len; k++) p.push(WORDS[(w++ + k * 3) % WORDS.length]);
        p[0] = p[0][0].toUpperCase() + p[0].slice(1);
        paras.push(p.join(' ') + '. *Italic* and **bold** here.');
        n += len + 4;
      }
      const sc = makeDoc('scene', `Scene ${c + 1}.${s + 1}`, paras.join('\n\n'), { status: 'draft' });
      files[docPath(sc.id)] = serializeDoc(sc);
      node.children!.push({ id: sc.id });
    }
    binder.push(node);
  }
  files['project.yaml'] = serializeMeta({ format: 1, title: 'Long Book', mode: 'novel', binder });
  return files;
}

const time = async <T,>(fn: () => Promise<T> | T) => {
  const t = performance.now();
  const r = await fn();
  return [r, performance.now() - t] as const;
};

test('a 150,000-word novel opens, counts and exports within budget', async () => {
  const files = bigNovel();
  const fs = new MemoryFs(files);
  const [p, load] = await time(() => loadProject(fs));
  const [total, count] = await time(() => Object.values(p.docs).reduce((a, d) => a + (d.kind === 'scene' ? countMarkdown(d.body) : 0), 0));
  assert.ok(total > 145_000, `words: ${total}`);
  const [c, comp] = await time(() => compile(p.meta, p.docs, DEFAULT_EXPORT));
  const [docx, tDocx] = await time(() => buildDocx(c, DEFAULT_EXPORT));
  const [epub, tEpub] = await time(() => buildEpub(c, DEFAULT_EXPORT));
  const longest = Object.values(p.docs).find((d) => d.kind === 'scene')!;
  const [, round] = await time(() => {
    for (let i = 0; i < 50; i++) serializeMarkdown(parseMarkdown(longest.body));
  });
  console.log(
    `  ${total.toLocaleString()} words in ${Object.keys(p.docs).length} files: load ${load.toFixed(0)} ms, count ${count.toFixed(0)} ms, compile ${comp.toFixed(0)} ms, docx ${tDocx.toFixed(0)} ms (${(docx.length / 1024).toFixed(0)} KB), epub ${tEpub.toFixed(0)} ms (${(epub.length / 1024).toFixed(0)} KB), 50 scene round-trips ${round.toFixed(0)} ms`,
  );
  // Generous ceilings so slow CI machines pass; real numbers print above.
  assert.ok(load < 1500, 'load');
  assert.ok(count < 500, 'count');
  assert.ok(comp + tDocx + tEpub < 3000, 'export');
  assert.ok(round < 500, 'editor round-trip');
});
