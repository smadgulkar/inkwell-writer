import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, DEFAULT_EXPORT, numberWords, roman, roundedWords, shortTitle } from '../src/export/compile';
import { buildDocx } from '../src/export/docx';
import { buildEpub, manuscriptHtml, printHtml } from '../src/export/book';
import { buildMarkdown } from '../src/export/markdown';
import { compileBible } from '../src/export/bible';
import { crc32, unzip, zip } from '../src/export/zip';
import { demoFiles } from '../src/demo';
import { parseDoc, parseMeta } from '../src/model/project';
import type { Doc } from '../src/model/types';

function demo() {
  const f = demoFiles().text;
  const meta = parseMeta(f['project.yaml']);
  const docs: Record<string, Doc> = {};
  for (const [k, v] of Object.entries(f)) if (k.endsWith('.md')) {
    const d = parseDoc(v);
    docs[d.id] = d;
  }
  return { meta, docs };
}

test('numbers and rounding', () => {
  assert.equal(numberWords(21), 'twenty-one');
  assert.equal(numberWords(7), 'seven');
  assert.equal(roman(14), 'XIV');
  assert.equal(roundedWords(4321), 4300);
  assert.equal(roundedWords(87654), 88000);
  assert.equal(shortTitle('The Salt Road Home Again'), 'SALT ROAD HOME');
});

test('crc32 and zip round trip', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = zip([{ path: 'a.txt', data: 'hello' }, { path: 'dir/b.xml', data: '<x/>' }]);
  assert.deepEqual(unzip(z), { 'a.txt': 'hello', 'dir/b.xml': '<x/>' });
});

test('compile orders chapters and filters scenes', () => {
  const { meta, docs } = demo();
  const all = compile(meta, docs, DEFAULT_EXPORT);
  const chapters = all.sections.filter((s) => s.kind === 'chapter');
  assert.equal(chapters[0].label, 'Chapter One');
  assert.equal(chapters[0].title, 'The Station');
  assert.ok(all.words > 200);
  assert.ok(!JSON.stringify(all.sections).includes('ink:'), 'links are stripped');
  const revisedOnly = compile(meta, docs, { ...DEFAULT_EXPORT, statuses: ['revised'] });
  assert.equal(revisedOnly.scenes, 1);
  assert.equal(revisedOnly.sections.filter((s) => s.kind === 'chapter').length, 1, 'empty chapters dropped');
  const one = compile(meta, docs, { ...DEFAULT_EXPORT, root: 'ch_station1' });
  assert.equal(one.title, 'The Station');
});

test('docx is a valid package with manuscript conventions', () => {
  const { meta, docs } = demo();
  const c = compile(meta, docs, { ...DEFAULT_EXPORT, byline: 'Jane Doe', contact: '12 Any St\njane@example.com' });
  const files = unzip(buildDocx(c, { ...DEFAULT_EXPORT, byline: 'Jane Doe', contact: '12 Any St\njane@example.com' }));
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/header1.xml']) assert.ok(files[f], f);
  const doc = files['word/document.xml'];
  assert.match(doc, /about [\d,]+ words/);
  assert.match(doc, /by Jane Doe/);
  assert.match(doc, /jane@example\.com/);
  assert.match(doc, /<w:t xml:space="preserve">#<\/w:t>/, 'scene break marker');
  assert.match(doc, />END</);
  assert.match(files['word/header1.xml'], /Doe \/ SALT ROAD \//);
  assert.match(files['word/styles.xml'], /Courier New/);
  assert.match(files['word/styles.xml'], /w:line="480"/, 'double spaced');
  // Well-formed enough: every opened paragraph closes.
  assert.equal((doc.match(/<w:p>/g) || []).length, (doc.match(/<\/w:p>/g) || []).length);
});

test('epub has the required structure', () => {
  const { meta, docs } = demo();
  const c = compile(meta, docs, DEFAULT_EXPORT);
  const z = buildEpub(c, DEFAULT_EXPORT);
  const names = Object.keys(unzip(z));
  assert.equal(names[0], 'mimetype');
  assert.equal(new TextDecoder().decode(z.subarray(30, 38)), 'mimetype');
  const files = unzip(z);
  assert.equal(files.mimetype, 'application/epub+zip');
  assert.match(files['OEBPS/content.opf'], /<dc:title>The Salt Road<\/dc:title>/);
  assert.match(files['OEBPS/nav.xhtml'], /Chapter One: The Station/);
  const chap = Object.entries(files).find(([k, v]) => k.endsWith('.xhtml') && v.includes('The train left'))!;
  assert.ok(chap);
  assert.ok(!/&nbsp;|<br>/.test(chap[1]));
});

test('markdown and print html', () => {
  const { meta, docs } = demo();
  const c = compile(meta, docs, DEFAULT_EXPORT);
  const md = buildMarkdown(c, DEFAULT_EXPORT);
  assert.match(md, /^# The Salt Road/);
  assert.match(md, /## Chapter One: The Station/);
  assert.ok(!md.includes('ink:'));
  assert.match(printHtml(c, DEFAULT_EXPORT, 'trade'), /size: 6in 9in/);
  assert.match(manuscriptHtml(c, DEFAULT_EXPORT), /about [\d,]+ words/);
});

test('story bible gathers the cast and world', () => {
  const { meta, docs } = demo();
  const b = compileBible(meta, docs);
  const parts = b.sections.filter((s) => s.kind === 'part').map((s) => s.title);
  assert.equal(parts[0], 'Characters');
  assert.ok(parts.includes('Places'));
  const mara = b.sections.find((s) => s.title?.startsWith('Mara'))!;
  assert.equal(mara.label, 'Protagonist');
  assert.ok(JSON.stringify(mara.blocks).includes('Arc'));
});
