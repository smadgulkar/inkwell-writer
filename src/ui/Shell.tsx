import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LocalFs } from '../fs/local';
import { isTauri } from '../fs/tauri';
import { kindOf } from '../model/ids';
import { store, useStore, type Section } from '../store/store';
import { CharacterList, WorldTree } from './EntitySidebar';
import { CharacterPage, WorldPage } from './EntityPage';
import { CharactersOverview, WorldOverview } from './Overview';
import { SearchPage } from './SearchPage';
import { PlanPage, PlanSidebar } from './plan/PlanPage';
import { SubplotPage } from './plan/SubplotPage';
import { MapPage } from './maps/MapPage';
import { MapList, MapsOverview } from './maps/MapPanels';
import { EventPage, TimelinePage } from './timeline/TimelinePage';
import { TimelineSidebar } from './timeline/TimelineSidebar';
import { IdeaPage, IdeasPage, IdeasSidebar } from './ideas/Ideas';
import { MarketPage, SubmissionPage, SubmissionsPage, SubmissionsSidebar } from './submissions/Submissions';
import { Binder } from './Binder';
import { MOD } from './commands';
import { IconIdea, IconWarn, IconExport, IconSubmissions, IconTimeline, IconMap, IconPlan, IconCharacters, IconFocus, IconInspector, IconNewChapter, IconNewScene, IconPart, IconSearch, IconSettings, IconSidebar, IconWorld, IconWrite, Mark } from './icons';
import { Inspector } from './Inspector';
import { ErrorBoundary } from './ErrorBoundary';
import { Page } from './Page';

export function Shell() {
  const ui = useStore((s) => s.ui);
  const meta = useStore((s) => s.project!.meta);
  const fsLabel = useStore((s) => (s.project!.fs instanceof LocalFs ? (isTauri() ? 'Kept inside Inkwell' : 'Stored in this browser') : `Folder: ${s.project!.fs.label}`));
  const [width, setWidth] = useState(() => Number(localStorage.getItem('inkwell:sidebar-w')) || 280);
  const short = meta.mode === 'short';
  const section = useStore((s) => s.section);
  const sidebarSection: Section = section === 'search' ? 'write' : section;
  const railItems: [Section, string, React.ComponentType, string][] = [
    ['write', short ? 'Story' : 'Manuscript', IconWrite, `${MOD} 1`],
    ['plan', 'Plan', IconPlan, `${MOD} 2`],
    ['characters', 'Characters', IconCharacters, `${MOD} 3`],
    ['world', 'World', IconWorld, `${MOD} 4`],
    ['maps', 'Maps', IconMap, `${MOD} 5`],
    ['timeline', 'Timeline', IconTimeline, `${MOD} 6`],
    ['ideas', 'Ideas', IconIdea, `${MOD} 8`],
    ...(short ? ([['submissions', 'Submissions', IconSubmissions, `${MOD} 7`]] as [Section, string, React.ComponentType, string][]) : []),
    ['search', 'Search', IconSearch, `${MOD} Shift S`],
  ];

  return (
    <div className={`shell ${ui.focus ? 'focus-mode' : ''}`}>
      <nav className="rail" aria-label="Main">
        <Mark className="mark" />
        {railItems.map(([sec, label, Icon, keys]) => (
          <button key={sec} className="icon-btn" aria-pressed={section === sec} aria-label={label} title={`${label} (${keys})`} onClick={() => store.setSection(sec)}>
            <Icon />
          </button>
        ))}
        <div className="spacer" />
        <button className="icon-btn" aria-pressed={ui.focus} aria-label="Focus mode" title={`Focus mode (${MOD} Shift F)`} onClick={() => store.setUi({ focus: !ui.focus })}>
          <IconFocus />
        </button>
        <button className="icon-btn" aria-label="Settings" title={`Settings (${MOD} ,)`} onClick={() => store.setSettings(!store.get().settings)}>
          <IconSettings />
        </button>
      </nav>

      {ui.sidebar && !ui.focus ? (
      <aside className="sidebar" style={{ width }} aria-label="Sidebar">
        <div className="sidebar-head">
          <button className="icon-btn head-export" aria-label="Export" title={`Export (${MOD} Shift E)`} onClick={() => store.setExport(true)}>
            <IconExport />
          </button>
          <h1 className="project-title" title={meta.title}>
            {meta.title}
          </h1>
          <div className="project-sub">
            {short ? 'Short story' : 'Novel'}
            {meta.author ? `, ${meta.author}` : ''}
          </div>
        </div>
        {sidebarSection === 'characters' && <CharacterList />}
        {sidebarSection === 'world' && <WorldTree />}
        {sidebarSection === 'plan' && <PlanSidebar />}
        {sidebarSection === 'maps' && <MapList />}
        {sidebarSection === 'timeline' && <TimelineSidebar />}
        {sidebarSection === 'submissions' && <SubmissionsSidebar />}
        {sidebarSection === 'ideas' && <IdeasSidebar />}
        {sidebarSection === 'write' && (
        <>
        <div className="sidebar-tools">
          <span className="label">{short ? 'Sections' : 'Manuscript'}</span>
          {!short && (
            <>
              <button className="icon-btn" title="New part" aria-label="New part" onClick={() => store.addNode('part')}>
                <IconPart />
              </button>
              <button className="icon-btn" title={`New chapter (${MOD} Shift N)`} aria-label="New chapter" onClick={() => store.addNode('chapter')}>
                <IconNewChapter />
              </button>
            </>
          )}
          <button className="icon-btn" title={`New scene (${MOD} N)`} aria-label="New scene" onClick={() => store.addNode('scene')}>
            <IconNewScene />
          </button>
          <button className="icon-btn" title={`Hide binder (${MOD} \\)`} aria-label="Hide binder" onClick={() => store.setUi({ sidebar: false })}>
            <IconSidebar />
          </button>
        </div>
        <Binder />
        </>
        )}
        <ResizeHandle width={width} setWidth={setWidth} />
      </aside>
      ) : (
        <div />
      )}

      <main className="main">
        {(!ui.sidebar || !ui.inspector) && !ui.focus && (
          <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', zIndex: 3, pointerEvents: 'none' }}>
            <span style={{ pointerEvents: 'auto' }}>
              {!ui.sidebar && (
                <button className="icon-btn" title={`Show binder (${MOD} \\)`} aria-label="Show binder" onClick={() => store.setUi({ sidebar: true })}>
                  <IconSidebar />
                </button>
              )}
            </span>
            <span style={{ pointerEvents: 'auto' }}>
              {!ui.inspector && (
                <button className="icon-btn" title={`Show inspector (${MOD} .)`} aria-label="Show inspector" onClick={() => store.setUi({ inspector: true })}>
                  <IconInspector />
                </button>
              )}
            </span>
          </div>
        )}
        {ui.inspector && !ui.focus && (
          <button
            className="icon-btn"
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 3 }}
            title={`Hide inspector (${MOD} .)`}
            aria-label="Hide inspector"
            onClick={() => store.setUi({ inspector: false })}
          >
            <IconInspector />
          </button>
        )}
        <MainViewGuarded />
      </main>

      {ui.inspector && !ui.focus && <Inspector />}
      {(!ui.inspector || ui.focus) && <div />}

      <StatusBar fsLabel={fsLabel} />
    </div>
  );
}

function MainViewGuarded() {
  const id = useStore((s) => s.selectedId);
  const section = useStore((s) => s.section);
  return (
    <ErrorBoundary scope="page" resetKey={`${section}:${id}`}>
      <MainView />
    </ErrorBoundary>
  );
}

function MainView() {
  const section = useStore((s) => s.section);
  const id = useStore((s) => s.selectedId);
  const doc = useStore((s) => (s.selectedId ? s.project?.docs[s.selectedId] : undefined));
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [id, section]);
  if (section === 'search')
    return (
      <div className="page-scroll" ref={scrollRef}>
        <SearchPage />
      </div>
    );
  if (doc?.kind === 'map') return <MapPage doc={doc} />;
  if (doc?.kind === 'idea' || (!doc && section === 'ideas')) {
    return (
      <div className="page-scroll" ref={scrollRef}>
        {doc ? <IdeaPage doc={doc} /> : <IdeasPage />}
      </div>
    );
  }
  if (doc?.kind === 'submission' || doc?.kind === 'market' || (!doc && section === 'submissions')) {
    return (
      <div className="page-scroll" ref={scrollRef}>
        {doc?.kind === 'submission' ? <SubmissionPage doc={doc} /> : doc?.kind === 'market' ? <MarketPage doc={doc} /> : <SubmissionsPage />}
      </div>
    );
  }
  if (doc?.kind === 'event' || (!doc && section === 'timeline')) {
    return (
      <div className="page-scroll" ref={scrollRef}>
        {doc ? <EventPage doc={doc} /> : <TimelinePage />}
      </div>
    );
  }
  if (!doc && section === 'maps') {
    return (
      <div className="page-scroll" ref={scrollRef}>
        <MapsOverview />
      </div>
    );
  }
  if (doc?.kind === 'subplot' || (!doc && section === 'plan')) {
    return (
      <div className="page-scroll" ref={scrollRef}>
        {doc ? <SubplotPage doc={doc} /> : <PlanPage />}
      </div>
    );
  }
  if (doc?.kind === 'character' || doc?.kind === 'world' || (!doc && (section === 'characters' || section === 'world'))) {
    return (
      <div className="page-scroll" ref={scrollRef}>
        {doc?.kind === 'character' ? (
          <CharacterPage doc={doc} />
        ) : doc?.kind === 'world' ? (
          <WorldPage doc={doc} />
        ) : section === 'characters' ? (
          <CharactersOverview />
        ) : (
          <WorldOverview />
        )}
      </div>
    );
  }
  return <Page />;
}

function ResizeHandle({ width, setWidth }: { width: number; setWidth(w: number): void }) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setWidth(Math.max(220, Math.min(420, start.current.w + e.clientX - start.current.x)));
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem('inkwell:sidebar-w', String(width));
      } catch {
        /* ignore */
      }
    };
  }, [dragging, setWidth, width]);
  return (
    <div
      className={`resize-handle ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize binder"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        setDragging(true);
      }}
    />
  );
}

function Ring({ value }: { value: number }) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="7" cy="7" r={r} fill="none" stroke="var(--st-final)" strokeWidth="2" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} strokeLinecap="round" />
    </svg>
  );
}

function StatusBar({ fsLabel }: { fsLabel: string }) {
  const save = useStore((s) => s.save);
  const saveError = useStore((s) => s.saveError);
  const selected = useStore((s) => s.selectedId);
  const sceneWords = useStore((s) => (s.selectedId && kindOf(s.selectedId) === 'scene' ? s.counts[s.selectedId] ?? 0 : null));
  const selWords = useStore((s) => s.selectionWords);
  const counts = useStore((s) => s.counts);
  const conflicts = useStore((s) => s.conflicts.length);
  const todayStart = useStore((s) => s.todayStart);
  const goals = useStore((s) => s.project?.meta.goals);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const today = Math.max(0, total - todayStart);
  const label = save === 'saved' ? 'Saved' : save === 'saving' ? 'Saving…' : save === 'pending' ? 'Editing' : 'Not saved';

  return (
    <footer className="statusbar">
      <span className={`save-state ${save}`} title={saveError ?? fsLabel} role="status">
        <i />
        {label}
      </span>
      <span>{fsLabel}</span>
      {conflicts > 0 && (
        <button className="conflict-chip" onClick={() => store.setConflictsOpen(true)}>
          <IconWarn width={12} height={12} /> {conflicts === 1 ? '1 sync conflict' : `${conflicts} sync conflicts`}
        </button>
      )}
      <span className="grow" />
      {selected && sceneWords !== null && (
        <span>
          {selWords > 0 ? `${selWords.toLocaleString()} of ` : ''}
          {sceneWords.toLocaleString()} words
        </span>
      )}
      <span title="Words in the whole manuscript">{total.toLocaleString()} total</span>
      <span className="goal" title={goals?.daily ? `Today: ${today} of ${goals.daily} words` : 'Words written today'}>
        {goals?.daily ? <Ring value={today / goals.daily} /> : null}
        {today.toLocaleString()} today
      </span>
    </footer>
  );
}
