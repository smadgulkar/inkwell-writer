// Performance gate: what the browser downloads before the first screen, gzipped.
// Budget from the build spec: under 250 KB. Lazy chunks (export, sample project) don't count.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET = 250 * 1024;
const dist = new URL('../dist/', import.meta.url).pathname;
const seen = new Set();
const gz = (f) => gzipSync(readFileSync(join(dist, f))).length;
function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(join(dist, file), 'utf8');
  // Static imports only; import("./x.js") is lazy.
  for (const m of src.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) walk(m[1]);
}
walk('main.js');
const css = readdirSync(dist).filter((f) => f.endsWith('.css'));
const files = [...seen, ...css];
let total = 0;
for (const f of files) {
  const n = gz(f);
  total += n;
  console.log(`${(n / 1024).toFixed(1).padStart(7)} KB  ${f}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  initial load (gzipped), budget ${BUDGET / 1024} KB`);
if (total > BUDGET) {
  console.error('Over budget.');
  process.exit(1);
}
