// Plain Markdown export: clean text with no app-specific links.
import { serializeInline } from '../model/markdown';
import { separatorText, type Compiled, type ExportOptions } from './compile';

export function buildMarkdown(c: Compiled, o: ExportOptions) {
  const out: string[] = [`# ${c.title}`];
  if (c.author) out.push(`*${c.author}*`);
  let prevLoose = false;
  const sep = separatorText(o.separator) || '* * *';
  for (const s of c.sections) {
    const head = [s.label, s.title].filter(Boolean).join(': ');
    if (s.kind === 'part') out.push(`# ${head}`);
    else if (head) out.push(`## ${head}`);
    else if (s.kind === 'loose' && prevLoose) out.push(sep === '#' ? '\\#' : sep);
    for (const b of s.blocks) {
      const t = serializeInline(b.inlines);
      if (b.type === 'break') out.push(sep === '#' ? '\\#' : sep === '⁂' ? '⁂' : '* * *');
      else if (b.type === 'h2' || b.type === 'h3') out.push(`### ${t}`);
      else if (b.type === 'quote') out.push(`> ${t}`);
      else out.push(t);
    }
    prevLoose = s.kind === 'loose';
  }
  if (o.endMark) out.push('*The End*');
  return out.join('\n\n') + '\n';
}
