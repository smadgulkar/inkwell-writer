// .docx writer. Two looks: standard manuscript format (for submitting) and a clean document (for reading or a story bible).
import { normalize, type Block, type Inline } from '../model/markdown';
import { roundedWords, separatorText, shortTitle, surnameOf, xml, type Compiled, type ExportOptions } from './compile';
import { zip } from './zip';

export type DocxStyle = 'manuscript' | 'document';


// WordprocessingML requires property children in schema order; Word rejects files that get it wrong.
const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'widowControl', 'tabs', 'spacing', 'ind', 'jc', 'outlineLvl', 'rPr'];
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'color', 'sz', 'szCs', 'lang'];
function ordered(inner: string, order: string[]) {
  const parts = inner.match(/<w:(\w+)\b[^>]*\/>|<w:(\w+)\b[^>]*>[\s\S]*?<\/w:\2>/g) ?? [];
  const name = (x: string) => /^<w:(\w+)/.exec(x)![1];
  const seen = new Set<string>();
  return parts
    .filter((x) => (seen.has(name(x)) ? false : (seen.add(name(x)), true)))
    .sort((a, b) => order.indexOf(name(a)) - order.indexOf(name(b)))
    .join('');
}
const pPr = (inner: string) => `<w:pPr>${ordered(inner, PPR_ORDER)}</w:pPr>`;
const rPr = (inner: string) => (inner ? `<w:rPr>${ordered(inner, RPR_ORDER)}</w:rPr>` : '');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function runs(inl: Inline[], extra = '') {
  return normalize(inl)
    .map((r) => {
      const props = `${extra}${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.s ? '<w:strike/>' : ''}`;
      // Preserve leading/trailing spaces; split on newlines (shouldn't occur, but be safe).
      return r.text
        .split('\n')
        .map((t, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${rPr(props)}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`)
        .join('');
    })
    .join('');
}

const para = (style: string, body: string, extra = '') => `<w:p>${pPr(`<w:pStyle w:val="${style}"/>${extra}`)}${body}</w:p>`;
const text = (t: string, props = '') => `<w:r>${rPr(props)}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;

function blocksXml(blocks: Block[], o: ExportOptions, style: DocxStyle) {
  let afterBreak = true;
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'break') {
      const sep = separatorText(o.separator);
      out.push(para('SceneBreak', sep ? text(sep) : ''));
      afterBreak = true;
      continue;
    }
    if (b.type === 'h2' || b.type === 'h3') {
      out.push(para(style === 'manuscript' ? 'SceneTitle' : b.type === 'h2' ? 'Heading2' : 'Heading3', runs(b.inlines)));
      afterBreak = true;
      continue;
    }
    if (b.type === 'quote') {
      out.push(para('Quote', runs(b.inlines)));
      continue;
    }
    // Manuscripts indent every paragraph; documents skip the indent after a break or heading,
    // and for reference lines such as "Age: 34" or "— a beat".
    const listy = style === 'document' && (b.inlines[0]?.b || b.inlines[0]?.text.startsWith('— '));
    out.push(para(style === 'document' && (afterBreak || listy) ? (listy ? 'Field' : 'FirstParagraph') : 'Body', runs(b.inlines)));
    afterBreak = false;
  }
  return out.join('');
}

function stylesXml(o: ExportOptions, style: DocxStyle) {
  const ms = style === 'manuscript';
  const font = ms ? (o.font === 'courier' ? 'Courier New' : 'Times New Roman') : 'Georgia';
  const head = ms ? font : 'Georgia';
  const size = ms ? 24 : 22;
  const line = ms ? 480 : 300;
  const st = (id: string, name: string, p: string, r = '', basedOn = 'Normal') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/><w:qFormat/>${pPr(p)}${rPr(r)}</w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl/></w:pPr></w:style>
${st('Body', 'Body Text', `<w:ind w:firstLine="${ms ? 720 : 360}"/>${ms ? '' : '<w:jc w:val="both"/>'}`)}
${st('FirstParagraph', 'First Paragraph', ms ? '<w:ind w:firstLine="720"/>' : '<w:jc w:val="both"/>')}
${st('Field', 'Field', '<w:spacing w:after="40"/>')}
${st('Quote', 'Quote', `<w:ind w:left="720" w:right="720"/>${ms ? '' : '<w:spacing w:before="120" w:after="120"/>'}`, ms ? '' : '<w:i/>')}
${st('SceneBreak', 'Scene Break', `<w:jc w:val="center"/>${ms ? '' : '<w:spacing w:before="200" w:after="200"/>'}`)}
${st('SceneTitle', 'Scene Title', '<w:jc w:val="center"/><w:keepNext/>', '<w:b/>')}
${st('Contact', 'Contact', '<w:spacing w:line="240" w:lineRule="auto"/><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>')}
${st('Title', 'Title', `<w:jc w:val="center"/><w:keepNext/>${ms ? '' : '<w:spacing w:before="2400" w:after="240" w:line="240" w:lineRule="auto"/>'}`, ms ? '' : `<w:rFonts w:ascii="${head}" w:hAnsi="${head}"/><w:sz w:val="56"/>`)}
${st('Byline', 'Byline', '<w:jc w:val="center"/><w:keepNext/>', ms ? '' : '<w:i/><w:sz w:val="26"/>')}
${st('PartHeading', 'Part Heading', `<w:jc w:val="center"/><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="${ms ? 2880 : 1800}" w:after="${ms ? 0 : 240}"/>`, ms ? '' : '<w:smallCaps/><w:sz w:val="36"/>')}
${st('ChapterLabel', 'Chapter Label', `<w:jc w:val="center"/><w:keepNext/>${ms ? '' : '<w:spacing w:after="120" w:line="240" w:lineRule="auto"/>'}`, ms ? '' : '<w:smallCaps/><w:color w:val="666666"/><w:sz w:val="22"/>')}
${st('ChapterTitle', 'Chapter Title', `<w:jc w:val="center"/><w:keepNext/>${ms ? '' : '<w:spacing w:after="600" w:line="240" w:lineRule="auto"/>'}`, ms ? '' : '<w:sz w:val="40"/>')}
${st('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="360" w:after="120" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="28"/>')}
${st('Heading3', 'heading 3', '<w:keepNext/><w:spacing w:before="240" w:after="80" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="2"/>', '<w:b/><w:sz w:val="24"/>')}
${st('End', 'End Mark', '<w:jc w:val="center"/>')}
${st('Header', 'header', '<w:jc w:val="right"/><w:spacing w:line="240" w:lineRule="auto"/>')}
</w:styles>`;
}

function headerXml(running: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${W}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>${text(running + ' / ')}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>`;
}

function footerPageXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
}

export function docxBody(c: Compiled, o: ExportOptions, style: DocxStyle): string {
  const ms = style === 'manuscript';
  const out: string[] = [];
  const author = c.author || 'Author';
  if (ms) {
    // First page: contact block left, word count right, title a third of the way down.
    const contact = [o.legalName || author, ...o.contact.split('\n').map((l) => l.trim()).filter(Boolean)];
    out.push(para('Contact', text(contact[0]) + `<w:r><w:tab/></w:r>` + text(`about ${roundedWords(c.words).toLocaleString('en-US')} words`)));
    for (const l of contact.slice(1)) out.push(para('Contact', text(l)));
    out.push(para('Title', text(c.title), '<w:spacing w:before="3600"/>'));
    out.push(para('Byline', text(`by ${author}`)));
    out.push(para('Body', ''));
  } else if (o.titlePage) {
    out.push(para('Title', text(c.title)));
    if (c.author) out.push(para('Byline', text(c.author)));
  }
  let first = true;
  let afterPart = false;
  for (const s of c.sections) {
    if (s.kind === 'part') {
      afterPart = true;
      out.push(para('PartHeading', text([s.label, s.title].filter(Boolean).join(': '))));
      first = false;
      continue;
    }
    if (s.kind === 'chapter' && (s.label || s.title)) {
      // In a manuscript the first chapter continues the title page; each later one starts a new page a third down.
      const brk = ms ? (first ? '' : '<w:pageBreakBefore/><w:spacing w:before="2880"/>') : (first && !o.titlePage) || afterPart ? '<w:spacing w:before="480"/>' : '<w:pageBreakBefore/><w:spacing w:before="2400"/>';
      if (ms) {
        out.push(para('ChapterLabel', text([s.label, s.title].filter(Boolean).join(': ')), brk));
        out.push(para('Body', ''));
      } else {
        if (s.label) out.push(para('ChapterLabel', text(s.label), brk));
        if (s.title) out.push(para('ChapterTitle', text(s.title), s.label ? '' : brk));
      }
    } else if (!ms && !first && s.kind === 'chapter') {
      out.push(para('SceneBreak', text(separatorText(o.separator))));
    }
    out.push(blocksXml(s.blocks, o, style));
    first = false;
    afterPart = false;
  }
  if (o.endMark) out.push(para('End', text(ms ? 'END' : '— End —'), ms ? '' : '<w:spacing w:before="480"/>'));
  return out.join('\n');
}

export function buildDocx(c: Compiled, o: ExportOptions, style: DocxStyle = 'manuscript'): Uint8Array {
  const ms = style === 'manuscript';
  const running = `${surnameOf(o.legalName || c.author || 'Author')} / ${shortTitle(c.title)}`;
  const sect = `<w:sectPr>${ms ? '<w:headerReference w:type="default" r:id="rIdHeader"/>' : '<w:footerReference w:type="default" r:id="rIdFooter"/>'}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
${docxBody(c, o, style)}
${sect}
</w:body></w:document>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return zip([
    {
      path: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    },
    {
      path: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    },
    {
      path: 'docProps/core.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(c.title)}</dc:title><dc:creator>${xml(c.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    },
    {
      path: 'word/_rels/document.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    },
    { path: 'word/document.xml', data: document },
    { path: 'word/styles.xml', data: stylesXml(o, style) },
    {
      path: 'word/settings.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W}><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`,
    },
    { path: 'word/header1.xml', data: headerXml(running) },
    { path: 'word/footer1.xml', data: footerPageXml() },
  ]);
}
