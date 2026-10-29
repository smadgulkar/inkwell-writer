import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDocx } from '../../export/docx';
import { blocksHtml, buildEpub, BOOK_CSS, printHtml, TRIMS, type Trim } from '../../export/book';
import { buildMarkdown } from '../../export/markdown';
import { compileBible } from '../../export/bible';
import { compile, DEFAULT_EXPORT, roundedWords, shortTitle, surnameOf, type ChapterHeading, type Compiled, type ExportOptions, type NumberStyle, type Separator } from '../../export/compile';
import { storyOptions } from '../../model/submissions';
import { STATUSES, type Status } from '../../model/types';
import { store, useStore } from '../../store/store';
import { IconBible, IconDocx, IconEbook, IconExport, IconMarkdown, IconPrint, IconScene, IconX } from '../icons';
import { deliver, fileSafe, printDocument } from './save';

type Preset = 'manuscript' | 'epub' | 'pdf' | 'reading' | 'markdown' | 'bible';
type BibleFormat = 'docx' | 'pdf' | 'md';

interface ExportPrefs extends Partial<Omit<ExportOptions, 'separator'>> {
  preset?: Preset;
  trim?: Trim;
  separators?: Partial<Record<Preset, Separator>>;
  bibleFormat?: BibleFormat;
  bible?: { characters: boolean; world: boolean; subplots: boolean };
}

const PRESETS: { id: Preset; title: string; ext: string; blurb: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'manuscript', title: 'Standard manuscript', ext: '.docx', blurb: 'For agents, editors and magazines', Icon: IconDocx },
  { id: 'epub', title: 'E-book', ext: '.epub', blurb: 'Kindle, Kobo, Apple Books, beta readers', Icon: IconEbook },
  { id: 'pdf', title: 'Print-ready PDF', ext: '.pdf', blurb: 'Typeset pages at book size', Icon: IconPrint },
  { id: 'reading', title: 'Reading copy', ext: '.docx', blurb: 'A clean Word file to share for notes', Icon: IconScene },
  { id: 'markdown', title: 'Markdown', ext: '.md', blurb: 'Plain text for anywhere else', Icon: IconMarkdown },
  { id: 'bible', title: 'Story bible', ext: '.docx', blurb: 'Your cast, world and subplots', Icon: IconBible },
];

const SEP_DEFAULT: Record<Preset, Separator> = { manuscript: '#', epub: '⁂', pdf: '⁂', reading: '⁂', markdown: '* * *', bible: '⁂' };
const SEPARATORS: [Separator, string][] = [
  ['#', '#'],
  ['* * *', '* * *'],
  ['⁂', '⁂'],
  ['blank', 'Blank line'],
];

const fontsHref = () => (document.querySelector('link[href*="fonts.googleapis.com/css"]') as HTMLLinkElement | null)?.href;

function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="ex-row">
      <div className="ex-row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="ex-row-control">{children}</div>
    </div>
  );
}

export function ExportDialog() {
  const project = useStore((s) => s.project!);
  const { meta, docs } = project;
  const saved = (meta.export ?? {}) as ExportPrefs;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preset: Preset = saved.preset ?? (meta.mode === 'short' ? 'manuscript' : 'manuscript');
  const set = (patch: Partial<ExportPrefs>) => store.updateMeta({ export: { ...saved, ...patch } });

  const defaultByline = meta.author && meta.author !== 'Sample project' ? meta.author : '';
  const opts: ExportOptions = {
    ...DEFAULT_EXPORT,
    ...saved,
    byline: saved.byline ?? defaultByline,
    statuses: saved.statuses ?? DEFAULT_EXPORT.statuses,
    separator: saved.separators?.[preset] ?? SEP_DEFAULT[preset],
    root: saved.root && docs[saved.root] ? saved.root : null,
  };
  const trim: Trim = saved.trim ?? 'trade';
  const bibleFormat: BibleFormat = saved.bibleFormat ?? 'docx';
  const bibleParts = saved.bible ?? { characters: true, world: true, subplots: true };
  const isBible = preset === 'bible';

  const compiled = useMemo(
    () => (isBible ? compileBible({ ...meta, author: opts.byline || meta.author }, docs, bibleParts) : compile(meta, docs, opts)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, docs, isBible, JSON.stringify(opts), JSON.stringify(bibleParts)],
  );
  const stories = storyOptions(meta.binder, docs, meta.title);
  const hasChapters = Object.values(docs).some((d) => d.kind === 'chapter');
  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const d of Object.values(docs)) if (d.kind === 'scene' && Array.isArray(d.fields.tags)) for (const t of d.fields.tags as string[]) all.add(t);
    return [...all].sort();
  }, [docs]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && store.setExport(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.flush();
      const base = fileSafe(compiled.title);
      let result: string | null = null;
      if (preset === 'pdf' || (isBible && bibleFormat === 'pdf')) {
        await printDocument(printHtml(compiled, isBible ? { ...opts, endMark: false, titlePage: true } : opts, isBible ? 'letter' : trim, fontsHref()));
        store.toast('Choose “Save as PDF” in the print dialog.');
      } else {
        const file =
          preset === 'manuscript'
            ? { name: `${base} (manuscript).docx`, data: buildDocx(compiled, opts, 'manuscript'), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', kind: 'Word document' }
            : preset === 'reading'
              ? { name: `${base}.docx`, data: buildDocx(compiled, opts, 'document'), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', kind: 'Word document' }
              : preset === 'epub'
                ? { name: `${base}.epub`, data: buildEpub(compiled, opts, { id: `${meta.title}|${opts.root ?? ''}` }), mime: 'application/epub+zip', ext: 'epub', kind: 'EPUB e-book' }
                : preset === 'markdown' || bibleFormat === 'md'
                  ? { name: `${base}.md`, data: buildMarkdown(compiled, isBible ? { ...opts, endMark: false } : opts), mime: 'text/markdown', ext: 'md', kind: 'Markdown' }
                  : { name: `${base}.docx`, data: buildDocx(compiled, { ...opts, endMark: false, titlePage: true }, 'document'), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', kind: 'Word document' };
        result = await deliver(file);
        if (result) store.toast(`Exported ${result.split(/[\\/]/).pop()}`);
      }
      if (result !== null || preset === 'pdf' || bibleFormat === 'pdf') store.setExport(false);
    } catch (e) {
      setError((e as Error).message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const pages = isBible ? null : preset === 'manuscript' ? Math.max(1, Math.ceil(compiled.words / 250)) : preset === 'pdf' ? Math.max(1, Math.ceil(compiled.words / (trim === 'letter' ? 380 : 290))) : null;
  const current = PRESETS.find((p) => p.id === preset)!;
  const bibleExt = bibleFormat === 'md' ? '.md' : bibleFormat === 'pdf' ? '.pdf' : '.docx';
  const ext = isBible ? bibleExt : current.ext;

  return (
    <>
      <div className="scrim" onClick={() => !busy && store.setExport(false)} />
      <div className="export" role="dialog" aria-label="Export" aria-modal="true">
        <nav className="ex-presets" aria-label="Format">
          <h2>Export</h2>
          {PRESETS.map((p) => (
            <button key={p.id} className="ex-preset" aria-pressed={p.id === preset} onClick={() => set({ preset: p.id })}>
              <p.Icon className="ex-icon" />
              <span className="ex-preset-text">
                <span className="ex-preset-title">
                  {p.title} <span className="ex-ext">{p.id === 'bible' ? bibleExt : p.ext}</span>
                </span>
                <span className="ex-preset-blurb">{p.blurb}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="ex-options">
          <header className="ex-head">
            <div>
              <h3>{current.title}</h3>
              <p className="muted">{describe(preset)}</p>
            </div>
            <button className="icon-btn" aria-label="Close" onClick={() => store.setExport(false)}>
              <IconX />
            </button>
          </header>
          <div className="ex-scroll">
            {!isBible && stories.length > 1 && (
              <Row label="Story" hint="Export the whole collection or one story">
                <select className="input" aria-label="Story" value={opts.root ?? ''} onChange={(e) => set({ root: e.target.value || null })}>
                  {stories.map((s) => (
                    <option key={s.id ?? ''} value={s.id ?? ''}>
                      {s.id ? s.title : `All of ${s.title}`}
                    </option>
                  ))}
                </select>
              </Row>
            )}

            {(preset === 'manuscript' || preset === 'epub' || preset === 'pdf' || preset === 'reading' || isBible) && (
              <Row label="Author name" hint={preset === 'manuscript' ? 'As it appears in the byline' : undefined}>
                <input className="input" aria-label="Author name" value={opts.byline} placeholder="Your name or pen name" onChange={(e) => set({ byline: e.target.value })} />
              </Row>
            )}

            {preset === 'manuscript' && (
              <>
                <Row label="Legal name" hint="If different from the byline">
                  <input className="input" aria-label="Legal name" value={opts.legalName} placeholder="Optional" onChange={(e) => set({ legalName: e.target.value })} />
                </Row>
                <Row label="Contact details" hint="Top left of the first page">
                  <textarea className="input ex-contact" aria-label="Contact details" rows={4} value={opts.contact} placeholder={'Street address\nCity, postcode\nemail@example.com\nPhone'} onChange={(e) => set({ contact: e.target.value })} />
                </Row>
                <Row label="Typeface">
                  <div className="segmented" role="group" aria-label="Typeface">
                    <button aria-pressed={opts.font === 'courier'} onClick={() => set({ font: 'courier' })}>
                      Courier
                    </button>
                    <button aria-pressed={opts.font === 'times'} onClick={() => set({ font: 'times' })}>
                      Times New Roman
                    </button>
                  </div>
                </Row>
              </>
            )}

            {preset === 'pdf' && (
              <Row label="Page size">
                <select className="input" aria-label="Page size" value={trim} onChange={(e) => set({ trim: e.target.value as Trim })}>
                  {(Object.keys(TRIMS) as Trim[]).map((t) => (
                    <option key={t} value={t}>
                      {TRIMS[t].label}
                    </option>
                  ))}
                </select>
              </Row>
            )}

            {isBible ? (
              <>
                <Row label="Format">
                  <div className="segmented" role="group" aria-label="Format">
                    {(
                      [
                        ['docx', 'Word'],
                        ['pdf', 'PDF'],
                        ['md', 'Markdown'],
                      ] as [BibleFormat, string][]
                    ).map(([f, l]) => (
                      <button key={f} aria-pressed={bibleFormat === f} onClick={() => set({ bibleFormat: f })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </Row>
                {(
                  [
                    ['characters', 'Characters'],
                    ['world', 'World'],
                    ['subplots', 'Subplots'],
                  ] as const
                ).map(([k, l]) => (
                  <Row key={k} label={l}>
                    <Switch label={`Include ${l.toLowerCase()}`} checked={bibleParts[k]} onChange={(v) => set({ bible: { ...bibleParts, [k]: v } })} />
                  </Row>
                ))}
              </>
            ) : (
              <>
                <div className="ex-group-label">What to include</div>
                <Row label="Scenes marked">
                  <div className="ex-status-chips" role="group" aria-label="Include scenes by status">
                    {STATUSES.map((st) => {
                      const on = opts.statuses.includes(st);
                      return (
                        <button
                          key={st}
                          className="ex-status"
                          aria-pressed={on}
                          onClick={() => {
                            const next: Status[] = on ? opts.statuses.filter((x) => x !== st) : STATUSES.filter((x) => x === st || opts.statuses.includes(x));
                            set({ statuses: next.length ? next : [st] });
                          }}
                        >
                          <span className={`status-dot ${st}`} /> {st}
                        </button>
                      );
                    })}
                  </div>
                </Row>
                {tags.length > 0 && (
                  <Row label="Leave out tags">
                    <div className="ex-status-chips" role="group" aria-label="Leave out scenes with these tags">
                      {tags.map((t) => {
                        const on = opts.excludeTags.includes(t);
                        return (
                          <button key={t} className="ex-status tag" aria-pressed={on} onClick={() => set({ excludeTags: on ? opts.excludeTags.filter((x) => x !== t) : [...opts.excludeTags, t] })}>
                            #{t}
                          </button>
                        );
                      })}
                    </div>
                  </Row>
                )}

                <div className="ex-group-label">Layout</div>
                {hasChapters && (
                  <Row label="Chapter headings">
                    <div className="ex-pair">
                      <select className="input" aria-label="Chapter headings" value={opts.chapterHeading} onChange={(e) => set({ chapterHeading: e.target.value as ChapterHeading })}>
                        <option value="number-title">Number and title</option>
                        <option value="number">Number only</option>
                        <option value="title">Title only</option>
                        <option value="none">None</option>
                      </select>
                      <select className="input" aria-label="Numbering" value={opts.numberStyle} disabled={opts.chapterHeading === 'title' || opts.chapterHeading === 'none'} onChange={(e) => set({ numberStyle: e.target.value as NumberStyle })}>
                        <option value="words">One, Two</option>
                        <option value="digits">1, 2</option>
                        <option value="roman">I, II</option>
                      </select>
                    </div>
                  </Row>
                )}
                <Row label="Scene breaks">
                  <div className="segmented" role="group" aria-label="Scene breaks">
                    {SEPARATORS.map(([s, l]) => (
                      <button key={s} aria-pressed={opts.separator === s} onClick={() => set({ separators: { ...saved.separators, [preset]: s } })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label="Scene titles" hint="Print each scene’s title above it">
                  <Switch label="Scene titles" checked={opts.sceneTitles} onChange={(v) => set({ sceneTitles: v })} />
                </Row>
                {(preset === 'epub' || preset === 'pdf' || preset === 'reading') && (
                  <Row label="Title page">
                    <Switch label="Title page" checked={opts.titlePage} onChange={(v) => set({ titlePage: v })} />
                  </Row>
                )}
                <Row label={preset === 'manuscript' ? '“END” at the end' : '“The End” at the end'}>
                  <Switch label="End mark" checked={opts.endMark} onChange={(v) => set({ endMark: v })} />
                </Row>
              </>
            )}
          </div>
          <footer className="ex-foot">
            <span className="ex-summary" aria-live="polite">
              {isBible ? (
                `${compiled.sections.filter((s) => s.kind === 'chapter').length} entries`
              ) : (
                <>
                  {compiled.scenes} {compiled.scenes === 1 ? 'scene' : 'scenes'} · {compiled.words.toLocaleString()} words
                  {pages ? ` · about ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''}
                </>
              )}
            </span>
            {error && <span className="form-error">{error}</span>}
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={() => store.setExport(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" onClick={run} disabled={busy || (!isBible && compiled.scenes === 0)}>
              {preset === 'pdf' || (isBible && bibleFormat === 'pdf') ? <IconPrint width={15} height={15} /> : <IconExport width={15} height={15} />}
              {busy ? 'Exporting…' : preset === 'pdf' || (isBible && bibleFormat === 'pdf') ? 'Print to PDF' : `Export ${ext}`}
            </button>
          </footer>
        </div>

        <div className="ex-preview" aria-label="Preview">
          <Preview preset={preset} c={compiled} o={opts} trim={trim} bibleFormat={bibleFormat} />
        </div>
      </div>
    </>
  );
}

function describe(p: Preset) {
  switch (p) {
    case 'manuscript':
      return 'The format most agents and magazines ask for: 12 pt, double spaced, one-inch margins, your name and the title in the header.';
    case 'epub':
      return 'A reflowable e-book with a table of contents. Send it to a Kindle or open it in any e-reader.';
    case 'pdf':
      return 'Typeset like a printed book. Your system’s print dialog opens; choose “Save as PDF”.';
    case 'reading':
      return 'A comfortable Word document for beta readers and editors to comment on.';
    case 'markdown':
      return 'The whole manuscript as one tidy Markdown file, without Inkwell’s links.';
    case 'bible':
      return 'Everything you know about your story’s people and places, as one reference document.';
  }
}

// ---------- preview ----------

const PAGE = { letter: [816, 1056], trade: [576, 864], a5: [559, 794] } as const;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** The opening of the book: first heading and enough blocks to fill a page. */
function opening(c: Compiled, o: ExportOptions, limit = 18) {
  const out: string[] = [];
  let n = 0;
  for (const s of c.sections) {
    if (s.kind === 'part') continue;
    const head = [s.label, s.title].filter(Boolean);
    if (head.length) out.push(`<header class="pv-chapter">${s.label ? `<span class="chapter-label">${esc(s.label)}</span>` : ''}${s.title ? `<span class="chapter-title">${esc(s.title)}</span>` : ''}</header>`);
    out.push(blocksHtml(s.blocks.slice(0, limit), o));
    n += s.blocks.length;
    break;
  }
  if (!n) out.push('<p class="pv-empty">Nothing to export with these settings.</p>');
  return out.join('');
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function Sheet({ w, h, scale, className, children }: { w: number; h: number; scale: number; className: string; children: React.ReactNode }) {
  return (
    <div className="pv-sheet-wrap" style={{ width: w * scale, height: h * scale }}>
      <div className={`pv-sheet ${className}`} style={{ width: w, height: h, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function Preview({ preset, c, o, trim, bibleFormat }: { preset: Preset; c: Compiled; o: ExportOptions; trim: Trim; bibleFormat: BibleFormat }) {
  const [ref, width] = useWidth();
  const avail = Math.max(200, width - 8);
  const body = useMemo(() => opening(c, o), [c, o]);

  let content: React.ReactNode;
  if (preset === 'manuscript') {
    const [w, h] = PAGE.letter;
    const contact = [o.legalName || c.author || 'Your Name', ...o.contact.split('\n').map((l) => l.trim()).filter(Boolean)];
    content = (
      <>
        <Sheet w={w} h={h} scale={avail / w} className={`pv-ms ${o.font}`}>
          <div className="pv-ms-contact">
            <div>
              {contact.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
            <div>about {roundedWords(c.words).toLocaleString('en-US')} words</div>
          </div>
          <div className="pv-ms-title">{c.title}</div>
          <div className="pv-ms-by">by {c.author || 'Your Name'}</div>
          <div className="pv-ms-body" dangerouslySetInnerHTML={{ __html: body }} />
        </Sheet>
        <div className="pv-caption">
          Header on later pages: <strong>{`${surnameOf(o.legalName || c.author || 'Name')} / ${shortTitle(c.title)} / 2`}</strong>
        </div>
      </>
    );
  } else if (preset === 'epub') {
    const w = 380;
    const h = 640;
    const s = Math.min(1, avail / (w + 24));
    content = (
      <div className="pv-reader" style={{ width: (w + 24) * s, height: (h + 24) * s }}>
        <div className="pv-reader-device" style={{ transform: `scale(${s})` }}>
          <div className="pv-reader-screen pv-book" style={{ width: w, height: h }} dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      </div>
    );
  } else if (preset === 'markdown' || (preset === 'bible' && bibleFormat === 'md')) {
    content = <pre className="pv-md">{buildMarkdown({ ...c, sections: c.sections.slice(0, preset === 'bible' ? 3 : 2) }, o).slice(0, 2200)}</pre>;
  } else {
    const size = preset === 'pdf' ? trim : 'letter';
    const [w, h] = size === 'trade' ? PAGE.trade : size === 'a5' ? PAGE.a5 : PAGE.letter;
    const bible = preset === 'bible';
    const html = bible ? bibleOpening(c, o) : body;
    content = (
      <Sheet w={w} h={h} scale={Math.min(avail / w, 520 / h)} className={`pv-book ${preset === 'pdf' ? 'pv-print' : 'pv-doc'}`}>
        <div className={`pv-book-body${bible ? ' reference' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
        {preset === 'pdf' && <div className="pv-folio">1</div>}
      </Sheet>
    );
  }
  return (
    <div className="pv" ref={ref}>
      <style>{PREVIEW_BOOK_CSS}</style>
      {content}
    </div>
  );
}

function bibleOpening(c: Compiled, o: ExportOptions) {
  const first = c.sections.find((s) => s.kind === 'chapter');
  const part = c.sections.find((s) => s.kind === 'part');
  if (!first) return '<p class="pv-empty">Nothing to include yet.</p>';
  return `${part ? `<div class="pv-part">${esc(part.title ?? '')}</div>` : ''}<header class="pv-chapter">${first.label ? `<span class="chapter-label">${esc(first.label)}</span>` : ''}<span class="chapter-title" style="font-style:normal">${esc(first.title ?? '')}</span></header>${blocksHtml(first.blocks.slice(0, 22), o).replace(/<p class="first">/, '<p>')}`;
}

// Book typography scoped to the preview, from the same rules the EPUB and PDF use.
const PREVIEW_BOOK_CSS = BOOK_CSS.replace(/(^|\n)([^@\n{}][^{}]*)\{/g, (_m, nl, sel: string) => `${nl}${sel.split(',').map((x) => `.pv-book ${x.trim().replace(/^body/, '')}`).join(', ')} {`);
