import { lazy, Suspense, useEffect, useRef } from 'react';
import { store, useStore } from '../store/store';
import { runCommand } from './commands';
import { Palette } from './Palette';
import { Settings } from './Settings';
import { Shell } from './Shell';
import { Welcome } from './Welcome';
import { TrashDialog } from './Trash';
import { ConflictsDialog } from './Conflicts';
import { CaptureDialog } from './ideas/Ideas';

// Export code only loads when someone exports.
const ExportDialog = lazy(() => import('./export/ExportDialog').then((m) => ({ default: m.ExportDialog })));
import type { ConfirmRequest, Theme } from '../store/store';

export function resolveTheme(theme: Theme): Exclude<Theme, 'system'> {
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dusk' : 'paper';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const t = resolveTheme(theme);
  root.setAttribute('data-theme', t);
  root.setAttribute('data-scheme', t === 'dusk' || t === 'night' ? 'dark' : 'light');
}

function ConfirmDialog({ req }: { req: ConfirmRequest }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <>
      <div className="scrim" onClick={() => req.resolve(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={(e) => e.key === 'Escape' && req.resolve(false)}>
        <h2 id="confirm-title">{req.title}</h2>
        <p>{req.body}</p>
        <div className="actions">
          <button className="btn ghost" onClick={() => req.resolve(false)}>
            Cancel
          </button>
          <button ref={ref} className={`btn ${req.danger ? 'danger-solid' : 'primary'}`} onClick={() => req.resolve(true)}>
            {req.action}
          </button>
        </div>
      </div>
    </>
  );
}

export function App() {
  const hasProject = useStore((s) => !!s.project);
  const ui = useStore((s) => s.ui);
  const palette = useStore((s) => s.palette);
  const settings = useStore((s) => s.settings);
  const toast = useStore((s) => s.toast);
  const title = useStore((s) => s.project?.meta.title);
  const confirmReq = useStore((s) => s.confirm);
  const trashOpen = useStore((s) => s.trashOpen && !!s.project);
  const exportOpen = useStore((s) => s.exportOpen && !!s.project);
  const captureOpen = useStore((s) => s.captureOpen && !!s.project);
  const conflictsOpen = useStore((s) => s.conflictsOpen && s.conflicts.length > 0);

  // Theme and typography live on the root element as data attributes and CSS variables.
  useEffect(() => {
    applyTheme(ui.theme);
    if (ui.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [ui.theme]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--prose-size', `${ui.proseSize}px`);
    root.style.setProperty('--measure', `${ui.measure}ch`);
    root.classList.forEach((c) => c.startsWith('prose-face-') && root.classList.remove(c));
    root.classList.add(`prose-face-${ui.proseFont}`);
  }, [ui.proseSize, ui.measure, ui.proseFont]);

  // Folders synced by Dropbox, Drive and the like change underneath us; look again when the window comes back.
  useEffect(() => {
    if (!hasProject) return;
    const check = () => document.visibilityState === 'visible' && void store.checkExternal();
    window.addEventListener('focus', check);
    const timer = window.setInterval(check, 20_000);
    return () => {
      window.removeEventListener('focus', check);
      window.clearInterval(timer);
    };
  }, [hasProject]);

  useEffect(() => {
    document.title = title ? `${title} — Inkwell` : 'Inkwell';
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && store.get().project) {
        const t = e.target as HTMLElement;
        if (t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName)) return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') store.back();
        else store.forward();
        return;
      }
      if (!mod) {
        if (e.key === 'Escape' && store.get().ui.focus && !store.get().palette) store.setUi({ focus: false });
        return;
      }
      const k = e.key.toLowerCase();
      const map: Record<string, string> = {
        k: 'palette',
        p: 'palette',
        n: e.shiftKey ? 'new-chapter' : 'new-scene',
        '\\': 'toggle-sidebar',
        '.': 'toggle-inspector',
        ',': 'settings',
        s: 'save',
        e: e.shiftKey ? 'export' : '',
        j: 'capture',
      };
      let cmd = map[k];
      if (k === 's' && e.altKey) cmd = 'snapshot';
      if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(k)) cmd = ['go-write', 'go-plan', 'go-characters', 'go-world', 'go-maps', 'go-timeline', 'go-submissions', 'go-ideas'][Number(k) - 1];
      if (k === 's' && e.shiftKey) cmd = 'search';
      if (k === 'f' && e.shiftKey) cmd = 'focus';
      if (k === 'i' && e.shiftKey) cmd = 'toggle-inspector';
      if (!cmd) return;
      if (cmd !== 'palette' && cmd !== 'settings' && !store.get().project) return;
      e.preventDefault();
      if (cmd === 'palette') store.setPalette(!store.get().palette);
      else if (cmd === 'save') void store.flush().then(() => store.toast('All changes saved'));
      else runCommand(cmd);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {hasProject ? <Shell /> : <Welcome />}
      {palette && <Palette />}
      {settings && <Settings />}
      {trashOpen && <TrashDialog />}
      {conflictsOpen && <ConflictsDialog />}
      {captureOpen && <CaptureDialog />}
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog />
        </Suspense>
      )}
      {confirmReq && <ConfirmDialog req={confirmReq} />}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          {toast.text}
        </div>
      )}
    </>
  );
}
