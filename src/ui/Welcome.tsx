import { useEffect, useRef, useState } from 'react';
import { deleteLocalProject, listLocalProjects, type LocalProjectInfo } from '../fs/local';
import type { Mode } from '../model/types';
import { store } from '../store/store';
import { IconBook, IconChevron, IconFeather, IconOpen, IconStory, IconTrash, IconChapter, IconX, Mark } from './icons';
import { canUseFolders, createProject, forgetFolder, inDesktopApp, listRecentFolders, openDemo, openFolderProject, openLocalProject, openTauriPath, type RecentFolder } from './projects';

function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Welcome() {
  const [recent, setRecent] = useState<LocalProjectInfo[]>(() => listLocalProjects());
  const [folders, setFolders] = useState<RecentFolder[]>(() => (inDesktopApp() ? listRecentFolders() : []));
  const desktop = inDesktopApp();
  const [creating, setCreating] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guard = (fn: () => Promise<unknown>) => () => {
    setError(null);
    fn().catch((e) => setError((e as Error).message));
  };

  return (
    <div className="welcome">
      <section className="welcome-left">
        <h1 className="wordmark">
          <Mark /> Inkwell
        </h1>
        <p className="welcome-lede">A quiet place to write stories and novels, kept as plain files you own.</p>
        <div className="start-list">
          <button className="start" onClick={() => setCreating('novel')}>
            <span className="glyph">
              <IconBook />
            </span>
            <span>
              <strong>Start a novel</strong>
              <span>Parts, chapters and scenes you can rearrange</span>
            </span>
            <IconChevron className="chev" />
          </button>
          <button className="start" onClick={() => setCreating('short')}>
            <span className="glyph">
              <IconStory />
            </span>
            <span>
              <strong>Start a short story</strong>
              <span>One page, length bands for submissions</span>
            </span>
            <IconChevron className="chev" />
          </button>
          {canUseFolders() && (
            <button className="start" onClick={guard(openFolderProject)}>
              <span className="glyph">
                <IconOpen />
              </span>
              <span>
                <strong>Open a project folder</strong>
                <span>Any folder containing a project.yaml</span>
              </span>
              <IconChevron className="chev" />
            </button>
          )}
          <button className="start" onClick={guard(openDemo)}>
            <span className="glyph">
              <IconFeather />
            </span>
            <span>
              <strong>Explore the sample novel</strong>
              <span>The Salt Road: four chapters, a cast, a world and a map</span>
            </span>
            <IconChevron className="chev" />
          </button>
        </div>
        {error && (
          <p role="alert" className="form-error" style={{ marginTop: 16 }}>
            {error}
          </p>
        )}
      </section>

      <section className="welcome-right">
        {folders.length > 0 && (
          <>
            <h2>Recent projects</h2>
            <div className="recent">
              {folders.map((f) => (
                <div
                  key={f.path}
                  className="recent-item"
                  role="button"
                  tabIndex={0}
                  title={f.path}
                  onClick={guard(() => openTauriPath(f.path))}
                  onKeyDown={(e) => e.key === 'Enter' && guard(() => openTauriPath(f.path))()}
                >
                  {f.mode === 'short' ? <IconStory width={16} height={16} /> : <IconBook width={16} height={16} />}
                  <span className="r-main">
                    <span className="r-title">{f.title}</span>
                    <span className="r-path">{f.path}</span>
                  </span>
                  <span className="r-meta">{ago(f.opened)}</span>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${f.title} from this list`}
                    title="Remove from this list (the folder is not touched)"
                    onClick={(e) => {
                      e.stopPropagation();
                      forgetFolder(f.path);
                      setFolders(listRecentFolders());
                    }}
                  >
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {recent.length > 0 && (
          <>
            <h2>{desktop ? 'Kept inside Inkwell' : 'In this browser'}</h2>
            <div className="recent">
              {recent.map((p) => (
                <div
                  key={p.key}
                  className="recent-item"
                  role="button"
                  tabIndex={0}
                  onClick={guard(() => openLocalProject(p.key))}
                  onKeyDown={(e) => e.key === 'Enter' && guard(() => openLocalProject(p.key))()}
                >
                  {p.mode === 'short' ? <IconStory width={16} height={16} /> : <IconChapter width={16} height={16} />}
                  <span className="r-title">{p.title}</span>
                  <span className="r-meta">{ago(p.updated)}</span>
                  <button
                    className="icon-btn"
                    aria-label={`Delete ${p.title}`}
                    title="Delete from this browser"
                    onClick={(e) => {
                      e.stopPropagation();
                      void store
                        .ask({ title: `Delete “${p.title}”?`, body: 'This removes the project from this browser. It cannot be undone.', action: 'Delete project', danger: true })
                        .then((ok) => {
                          if (!ok) return;
                          deleteLocalProject(p.key);
                          setRecent(listLocalProjects());
                        });
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        <h2>Syncing between devices</h2>
        <p className="sync-note">
          Keep your project folder inside <strong>Google Drive</strong>, <strong>Dropbox</strong>, <strong>OneDrive</strong> or <strong>iCloud Drive</strong>. Every scene is its own Markdown
          file, so the sync app carries your work everywhere and edits on two devices rarely collide.
        </p>
      </section>

      {creating && <NewProjectDialog mode={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

function NewProjectDialog({ mode, onClose }: { mode: Mode; onClose(): void }) {
  const [title, setTitle] = useState('');
  const folders = canUseFolders();
  const [where, setWhere] = useState<'folder' | 'browser'>(folders ? 'folder' : 'browser');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await createProject(title || (mode === 'short' ? 'Untitled story' : 'Untitled novel'), mode, where);
      if (!ok) setBusy(false);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form
        className="dialog"
        role="dialog"
        aria-label={mode === 'short' ? 'New short story' : 'New novel'}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>{mode === 'short' ? 'New short story' : 'New novel'}</h2>
        <p>You can change the title, and switch between novel and short story, any time.</p>
        <input
          ref={ref}
          className="input title-field"
          placeholder={mode === 'short' ? 'Story title' : 'Working title'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Title"
        />
        <div className="choices" role="radiogroup" aria-label="Where to keep it">
          {folders && (
            <button type="button" className="choice" aria-pressed={where === 'folder'} onClick={() => setWhere('folder')}>
              <IconOpen />
              <span>
                <strong>In a folder</strong>
                <span>Pick any folder, ideally inside Google Drive or Dropbox so it syncs. Recommended.</span>
              </span>
            </button>
          )}
          <button type="button" className="choice" aria-pressed={where === 'browser'} onClick={() => setWhere('browser')}>
            <IconFeather />
            <span>
              <strong>{inDesktopApp() ? 'Inside Inkwell for now' : 'In this browser'}</strong>
              <span>Quick to start, but it won’t sync. Move it to a folder later from Settings.</span>
            </span>
          </button>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Creating…' : where === 'folder' ? 'Choose a folder and create' : 'Create'}
          </button>
        </div>
      </form>
    </>
  );
}

