import { useEffect, useRef, useState } from 'react';
import { LocalFs } from '../fs/local';
import { assistant, CLAUDE_MODELS } from '../ideas/ai';
import { store, useStore, type ProseFont, type Theme, type UiPrefs } from '../store/store';

const THEME_CARDS: [Theme, string][] = [
  ['paper', 'Study'],
  ['light', 'Daylight'],
  ['dusk', 'Dusk'],
  ['night', 'Night'],
  ['system', 'Auto'],
];

const FONT_CARDS: [ProseFont, string, string][] = [
  ['literata', 'Literata', 'Made for long reading'],
  ['newsreader', 'Newsreader', 'Elegant, a little literary'],
  ['source', 'Source Serif', 'Crisp and modern'],
  ['garamond', 'EB Garamond', 'Classic book face'],
  ['sans', 'Instrument Sans', 'Clean sans serif'],
  ['typewriter', 'Courier Prime', 'Manuscript typewriter'],
];
import { saveToFolder } from './projects';

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange(v: T): void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Settings() {
  const ui = useStore((s) => s.ui);
  const project = useStore((s) => s.project);
  const ref = useRef<HTMLDivElement>(null);
  const set = (p: Partial<UiPrefs>) => store.setUi(p);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && store.setSettings(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const meta = project?.meta;
  return (
    <>
      <div className="scrim" style={{ background: 'transparent' }} onClick={() => store.setSettings(false)} />
      <div className="popover" ref={ref} role="dialog" aria-label="Settings">
        <h3>Appearance</h3>
        <div className="theme-cards" role="radiogroup" aria-label="Theme">
          {THEME_CARDS.map(([t, label]) => (
            <button key={t} role="radio" aria-checked={ui.theme === t} className={`theme-card tc-${t}`} onClick={() => set({ theme: t })}>
              <span className="tc-preview" aria-hidden="true">
                <i className="tc-side" />
                <i className="tc-page">
                  <b />
                  <b />
                  <b />
                </i>
              </span>
              <span className="tc-label">{label}</span>
            </button>
          ))}
        </div>
        <div className="settings-label">Writing font</div>
        <div className="font-list" role="radiogroup" aria-label="Writing font">
          {FONT_CARDS.map(([f, name, note]) => (
            <button key={f} role="radio" aria-checked={ui.proseFont === f} className={`font-option prose-face-${f}`} onClick={() => set({ proseFont: f })}>
              <span className="fo-sample">{name}</span>
              <span className="fo-note">{note}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <label htmlFor="size">Text size</label>
          <input id="size" type="range" min={15} max={26} value={ui.proseSize} onChange={(e) => set({ proseSize: Number(e.target.value) })} />
        </div>
        <div className="row">
          <label htmlFor="measure">Line width</label>
          <input id="measure" type="range" min={50} max={96} value={ui.measure} onChange={(e) => set({ measure: Number(e.target.value) })} />
        </div>
        <div className="row">
          <label>Typewriter scrolling</label>
          <Switch label="Typewriter scrolling" checked={ui.typewriter} onChange={(typewriter) => set({ typewriter })} />
        </div>
        <div className="row">
          <label>Focus mode</label>
          <Switch label="Focus mode" checked={ui.focus} onChange={(focus) => set({ focus })} />
        </div>

        {meta && (
          <>
            <hr />
            <h3>Project</h3>
            <div className="row">
              <label htmlFor="ptitle">Title</label>
              <input id="ptitle" className="input" value={meta.title} onChange={(e) => store.updateMeta({ title: e.target.value })} />
            </div>
            <div className="row">
              <label htmlFor="pauthor">Author</label>
              <input id="pauthor" className="input" value={meta.author ?? ''} onChange={(e) => store.updateMeta({ author: e.target.value || undefined })} />
            </div>
            <div className="row">
              <label>Mode</label>
              <Segmented
                label="Mode"
                value={meta.mode}
                onChange={(m) => store.setMode(m)}
                options={[
                  ['novel', 'Novel'],
                  ['short', 'Short story'],
                ]}
              />
            </div>
            <div className="row">
              <label htmlFor="pgoal">Word goal</label>
              <input
                id="pgoal"
                className="input"
                style={{ width: 140 }}
                type="number"
                min={0}
                step={1000}
                value={meta.goals?.project ?? ''}
                onChange={(e) => store.updateMeta({ goals: { ...meta.goals, project: Number(e.target.value) || undefined } })}
              />
            </div>
            <div className="row">
              <label htmlFor="pdaily">Daily goal</label>
              <input
                id="pdaily"
                className="input"
                style={{ width: 140 }}
                type="number"
                min={0}
                step={100}
                value={meta.goals?.daily ?? ''}
                onChange={(e) => store.updateMeta({ goals: { ...meta.goals, daily: Number(e.target.value) || undefined } })}
              />
            </div>
            <div className="row" style={{ marginBottom: 0 }}>
              <label>Stored in</label>
              {project.fs instanceof LocalFs ? (
                <button className="btn" onClick={() => void saveToFolder().catch((e) => store.toast((e as Error).message))}>
                  Save to a folder…
                </button>
              ) : (
                <span style={{ fontWeight: 500 }}>{project.fs.label}</span>
              )}
            </div>
          </>
        )}
        <hr />
        <AssistantSettings />
      </div>
    </>
  );
}

/** Optional: the writer's own Claude API key for deeper idea sorting. Kept on this device only. */
function AssistantSettings() {
  const [key, setKey] = useState(assistant.key());
  const [model, setModel] = useState(assistant.model());
  const [auto, setAuto] = useState(assistant.auto());
  return (
    <>
      <h3>Idea assistant</h3>
      <p className="settings-note">
        Optional. With your own Anthropic API key, Claude can sort ideas more deeply and ask questions that help develop them. Only the idea you ask about, plus the names and scene titles in this project, is sent. The key stays on this device.
      </p>
      <div className="row">
        <label htmlFor="ckey">API key</label>
        <input
          id="ckey"
          className="input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            assistant.setKey(e.target.value);
          }}
        />
      </div>
      {key && (
        <>
          <div className="row">
            <label htmlFor="cmodel">Model</label>
            <select
              id="cmodel"
              className="input"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                assistant.setModel(e.target.value);
              }}
            >
              {CLAUDE_MODELS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ marginBottom: 0 }}>
            <label>Sort new ideas automatically</label>
            <Switch
              label="Sort new ideas with Claude automatically"
              checked={auto}
              onChange={(v) => {
                setAuto(v);
                assistant.setAuto(v);
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
