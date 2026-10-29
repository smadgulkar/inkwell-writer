// Build and dev server. Uses esbuild directly: no Vite needed.
//   node build.mjs          production build into dist/
//   node build.mjs --serve  dev server with live rebuild on http://localhost:5173
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

const serve = process.argv.includes('--serve');
// --single: one JS file with no lazy chunks (used for the single-file web preview).
const single = process.argv.includes('--single');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');

const options = {
  entryPoints: { main: 'src/main.tsx' },
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  splitting: !single,
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  target: ['chrome110', 'safari16', 'firefox115'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production') },
  metafile: true,
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 5173 });
  console.log(`Inkwell dev server on http://localhost:${port}`);
} else {
  const result = await esbuild.build(options);
  const out = Object.entries(result.metafile.outputs).map(([f, o]) => `${f} ${(o.bytes / 1024).toFixed(1)} KB`);
  console.log(out.join('\n'));
}
