// Book-like HTML for EPUB chapters and the print/PDF export.
import { inlinesToHtml, type Block } from '../model/markdown';
import { roundedWords, separatorText, shortTitle, surnameOf, xml, type Compiled, type ExportOptions, type Section } from './compile';
import { zip } from './zip';

export function blocksHtml(blocks: Block[], o: ExportOptions) {
  let first = true;
  return blocks
    .map((b) => {
      if (b.type === 'break') {
        first = true;
        const sep = separatorText(o.separator);
        return `<p class="break" role="separator">${sep ? xml(sep) : '&#160;'}</p>`;
      }
      const inner = inlinesToHtml(b.inlines).replace(/<a data-ink="[^"]*"[^>]*>|<\/a>/g, '');
      if (b.type === 'h2' || b.type === 'h3') {
        first = true;
        return `<${b.type}>${inner}</${b.type}>`;
      }
      if (b.type === 'quote') return `<blockquote><p>${inner}</p></blockquote>`;
      const cls = first ? ' class="first"' : '';
      first = false;
      return `<p${cls}>${inner}</p>`;
    })
    .join('\n');
}

export const BOOK_CSS = `
body { margin: 0; font-family: "Literata", "Iowan Old Style", Georgia, serif; line-height: 1.5; text-rendering: optimizeLegibility; font-kerning: normal; hyphens: auto; -webkit-hyphens: auto; }
p { margin: 0; text-indent: 1.4em; text-align: justify; orphans: 2; widows: 2; }
p.first, h2 + p, h3 + p, .break + p { text-indent: 0; }
p.first::first-line { font-variant: small-caps; letter-spacing: 0.03em; }
.break { text-indent: 0; text-align: center; margin: 1.1em 0; letter-spacing: 0.3em; }
blockquote { margin: 1em 1.6em; font-style: italic; }
blockquote p { text-indent: 0; }
h1, h2, h3 { font-weight: 400; text-align: center; hyphens: none; -webkit-hyphens: none; }
.chapter-head { margin: 18% 0 2.6em; text-align: center; break-before: page; page-break-before: always; }
.chapter-head:first-child { break-before: auto; page-break-before: auto; }
.chapter-label { display: block; font-size: 0.8em; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.7; margin-bottom: 0.8em; }
.chapter-title { display: block; font-size: 1.7em; line-height: 1.2; font-style: italic; }
.part { text-align: center; margin-top: 38%; break-before: page; page-break-before: always; break-after: page; page-break-after: always; }
.part .chapter-label { font-size: 0.85em; }
.part .chapter-title { font-style: normal; font-size: 2em; }
.title-page { text-align: center; margin-top: 30%; break-after: page; page-break-after: always; }
.title-page h1 { font-size: 2.4em; line-height: 1.1; margin: 0 0 0.6em; letter-spacing: -0.01em; }
.title-page .by { font-style: italic; font-size: 1.15em; }
.end { text-align: center; margin-top: 3em; text-indent: 0; letter-spacing: 0.3em; font-size: 0.85em; }
h3 { font-size: 1em; font-style: italic; margin: 1.6em 0 0.8em; }
.reference p { text-indent: 0; text-align: left; margin-bottom: 0.25em; hyphens: manual; }
.reference p.first::first-line { font-variant: normal; letter-spacing: 0; }
.reference h3 { text-align: left; font-style: normal; font-weight: 600; font-size: 0.85em; letter-spacing: 0.06em; text-transform: uppercase; margin: 1.4em 0 0.4em; }
.reference .chapter-title { font-style: normal; }
`;

function headingHtml(s: Section) {
  if (s.kind === 'part') {
    return `<section class="part">${s.label ? `<span class="chapter-label">${xml(s.label)}</span>` : ''}${s.title ? `<h1 class="chapter-title">${xml(s.title)}</h1>` : ''}</section>`;
  }
  if (!s.label && !s.title) return '';
  return `<header class="chapter-head">${s.label ? `<span class="chapter-label">${xml(s.label)}</span>` : ''}${s.title ? `<h2 class="chapter-title">${xml(s.title)}</h2>` : ''}</header>`;
}

function sectionHtml(s: Section, o: ExportOptions, prevLoose: boolean) {
  const lead = s.kind === 'loose' && prevLoose ? `<p class="break">${xml(separatorText(o.separator)) || '&#160;'}</p>` : '';
  return headingHtml(s) + lead + blocksHtml(s.blocks, o);
}

// ---------- print / PDF ----------

export type Trim = 'trade' | 'a5' | 'letter';
export const TRIMS: Record<Trim, { label: string; size: string; margin: string; font: string }> = {
  trade: { label: 'Trade paperback, 6 × 9 in', size: '6in 9in', margin: '0.8in 0.7in 0.85in', font: '10.5pt' },
  a5: { label: 'A5', size: 'A5', margin: '20mm 17mm 22mm', font: '10.5pt' },
  letter: { label: 'Letter, reading copy', size: 'letter', margin: '1in 1.1in', font: '12pt' },
};

export function printHtml(c: Compiled, o: ExportOptions, trim: Trim, fontsHref?: string) {
  const t = TRIMS[trim];
  let prevLoose = false;
  const body = c.sections
    .map((s) => {
      const h = sectionHtml(s, o, prevLoose);
      prevLoose = s.kind === 'loose';
      return h;
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${xml(c.title)}</title>
${fontsHref ? `<link rel="stylesheet" href="${xml(fontsHref)}">` : ''}
<style>${BOOK_CSS}
@page { size: ${t.size}; margin: ${t.margin}; @bottom-center { content: counter(page); font: 9pt "Literata", Georgia, serif; } }
@page :first { @bottom-center { content: none; } }
html { font-size: ${t.font}; }
body { color: #111; }
</style></head><body${c.reference ? ' class="reference"' : ''}>
${o.titlePage ? `<section class="title-page"><h1>${xml(c.title)}</h1>${c.author ? `<p class="by">${xml(c.author)}</p>` : ''}</section>` : ''}
${body}
${o.endMark ? '<p class="end">THE END</p>' : ''}
</body></html>`;
}

// ---------- standard manuscript (HTML preview + print) ----------

export function manuscriptHtml(c: Compiled, o: ExportOptions) {
  const font = o.font === 'courier' ? '"Courier Prime", "Courier New", Courier, monospace' : '"Times New Roman", Times, serif';
  const author = c.author || 'Author';
  const contact = [o.legalName || author, ...o.contact.split('\n').map((l) => l.trim()).filter(Boolean)];
  const run = `${surnameOf(o.legalName || author)} / ${shortTitle(c.title)}`;
  let first = true;
  const sections = c.sections
    .map((s) => {
      let h = '';
      if (s.kind === 'part') h = `<p class="ms-part">${xml([s.label, s.title].filter(Boolean).join(': '))}</p>`;
      else if (s.label || s.title) h = `<p class="ms-chapter${first ? ' first' : ''}">${xml([s.label, s.title].filter(Boolean).join(': '))}</p>`;
      first = false;
      return h + blocksHtml(s.blocks, o);
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${xml(c.title)}</title><style>
@page { size: letter; margin: 1in; @top-right { content: "${run.replace(/"/g, '')} / " counter(page); font: 12pt ${font.replace(/"/g, "'")}; } }
@page :first { @top-right { content: none; } }
body { margin: 0; font: 12pt/2 ${font}; color: #000; }
p { margin: 0; text-indent: 0.5in; }
.contact { line-height: 1.2; display: flex; justify-content: space-between; text-indent: 0; }
.contact p { text-indent: 0; }
.ms-title { text-align: center; text-indent: 0; margin-top: 3in; }
.ms-by { text-align: center; text-indent: 0; margin-bottom: 2em; }
.break, .end { text-align: center; text-indent: 0; }
.ms-chapter { text-align: center; text-indent: 0; break-before: page; margin-top: 2in; margin-bottom: 2em; }
.ms-chapter.first { break-before: auto; margin-top: 0; }
.ms-part { text-align: center; text-indent: 0; break-before: page; margin-top: 3in; break-after: page; }
blockquote { margin: 0 0.5in; } blockquote p { text-indent: 0; }
h2, h3 { font: inherit; font-weight: bold; text-align: center; margin: 0; }
</style></head><body>
<div class="contact"><div>${contact.map((l) => `<p>${xml(l)}</p>`).join('')}</div><p>about ${roundedWords(c.words).toLocaleString('en-US')} words</p></div>
<p class="ms-title">${xml(c.title)}</p>
<p class="ms-by">by ${xml(author)}</p>
${sections}
${o.endMark ? '<p class="end">END</p>' : ''}
</body></html>`;
}

// ---------- EPUB 3 ----------

function uuidish(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const a = hex(h), b = hex(Math.imul(h, 2654435761) >>> 0), c = hex(Math.imul(h ^ 0x9e3779b9, 40503) >>> 0), d = hex((h * 31 + 7) >>> 0);
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${c.slice(1, 4)}-${c.slice(4)}${d}`;
}

const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;

/** XHTML needs void elements closed and named entities avoided. */
const toXhtml = (h: string) => h.replace(/<br>/g, '<br/>').replace(/&nbsp;/g, '&#160;');

export function buildEpub(c: Compiled, o: ExportOptions, opts: { id?: string; lang?: string } = {}): Uint8Array {
  const id = `urn:uuid:${uuidish(opts.id ?? c.title + c.author)}`;
  const lang = opts.lang ?? 'en';
  const files: { id: string; href: string; title: string; html: string }[] = [];
  if (o.titlePage) files.push({ id: 'title', href: 'title.xhtml', title: c.title, html: `<section class="title-page" epub:type="titlepage"><h1>${xml(c.title)}</h1>${c.author ? `<p class="by">${xml(c.author)}</p>` : ''}</section>` });
  let n = 0;
  let pending: string[] = [];
  let pendingTitle = c.title;
  let prevLoose = false;
  const flush = () => {
    if (!pending.length) return;
    n++;
    files.push({ id: `s${n}`, href: `section-${String(n).padStart(3, '0')}.xhtml`, title: pendingTitle, html: pending.join('\n') });
    pending = [];
  };
  for (const s of c.sections) {
    if (s.kind === 'part' || s.kind === 'chapter') {
      flush();
      pendingTitle = [s.label, s.title].filter(Boolean).join(': ') || c.title;
      pending.push(sectionHtml(s, o, false).replace('class="chapter-head"', 'class="chapter-head" style="break-before: auto; page-break-before: auto"'));
      if (s.kind === 'part') flush();
    } else {
      pending.push(sectionHtml(s, o, prevLoose));
    }
    prevLoose = s.kind === 'loose';
  }
  if (o.endMark) pending.push('<p class="end">THE END</p>');
  flush();
  const nav = files.filter((f) => f.id !== 'title');
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${xml(c.title)}</dc:title>
${c.author ? `<dc:creator>${xml(c.author)}</dc:creator>` : ''}
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
${files.map((f) => `<itemref idref="${f.id}"/>`).join('\n')}
</spine>
</package>`;
  const navHtml = xhtml('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav.map((f) => `<li><a href="${f.href}">${xml(f.title)}</a></li>`).join('')}</ol></nav>`);
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${xml(c.title)}</text></docTitle><navMap>${nav
    .map((f, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(f.title)}</text></navLabel><content src="${f.href}"/></navPoint>`)
    .join('')}</navMap></ncx>`;
  return zip([
    { path: 'mimetype', data: 'application/epub+zip' },
    {
      path: 'META-INF/container.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    },
    { path: 'OEBPS/content.opf', data: opf },
    { path: 'OEBPS/nav.xhtml', data: navHtml },
    { path: 'OEBPS/toc.ncx', data: ncx },
    { path: 'OEBPS/style.css', data: BOOK_CSS.replace(/"Literata", /g, '') },
    ...files.map((f) => ({ path: `OEBPS/${f.href}`, data: toXhtml(xhtml(f.title, f.html)) })),
  ]);
}
