// Hand an exported file to the user: a save dialog in the desktop app, a download in the browser.
import { base64FromBytes } from '../../fs/adapter';
import { isTauri, saveTauriFile } from '../../fs/tauri';

export interface ExportFile {
  name: string;
  data: Uint8Array | string;
  mime: string;
  ext: string;
  kind: string;
}

export async function deliver(f: ExportFile): Promise<string | null> {
  const bytes = typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data;
  if (isTauri()) return saveTauriFile(f.name, { name: f.kind, extensions: [f.ext] }, base64FromBytes(bytes));
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: f.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return f.name;
}

/** Print an HTML document through a hidden frame; the system dialog offers "Save as PDF". */
export function printDocument(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.append(frame);
    frame.onload = () => {
      const w = frame.contentWindow!;
      const done = () => {
        setTimeout(() => frame.remove(), 1000);
        resolve();
      };
      w.addEventListener('afterprint', done, { once: true });
      // Let web fonts settle so the pages don't print in a fallback face.
      const fonts = (frame.contentDocument as Document & { fonts?: FontFaceSet }).fonts;
      Promise.race([fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(() => {
        w.focus();
        w.print();
        setTimeout(done, 60_000);
      });
    };
    frame.srcdoc = html;
  });
}

export function fileSafe(title: string) {
  return (title.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80);
}
