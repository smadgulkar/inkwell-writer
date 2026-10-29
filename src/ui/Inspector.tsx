import { useMemo, useState } from 'react';
import { parentOf, scenesUnder } from '../model/binder';
import { IdeasFor } from './ideas/Ideas';
import { worldKindOf, WORLD_TEMPLATES } from '../model/entities';
import { STATUSES, type Doc, type Status } from '../model/types';
import { LENGTH_BANDS, lengthBand } from '../model/words';
import { store, useStore } from '../store/store';
import { IconPov, IconPlace, IconX, WORLD_ICON } from './icons';
import { confirmDelete } from './Binder';
import { Avatar, characterOptions, Picker, worldOptions } from './pickers';
import { sceneSubplots, subplotColorOf } from '../model/subplots';
import { subplotOptions, SubplotSwatch } from './plan/shared';
import { MapInspector, OnMaps } from './maps/MapPanels';
import { SnapshotSection } from './Snapshots';
import { StoryDateField } from './timeline/TimelineParts';

const n = (x: number) => x.toLocaleString();

function when(iso: unknown) {
  if (typeof iso !== 'string') return '—';
  const d = new Date(iso);
  if (isNaN(+d)) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Inspector() {
  const doc = useStore((s) => (s.selectedId ? s.project?.docs[s.selectedId] : undefined));
  const mode = useStore((s) => s.project?.meta.mode);
  const searching = useStore((s) => s.section === 'search');
  if (searching)
    return (
      <aside className="inspector" aria-label="Inspector">
        <ProjectSection />
      </aside>
    );
  return (
    <aside className="inspector" aria-label="Inspector">
      {doc?.kind === 'scene' && <SceneInspector doc={doc} short={mode === 'short'} />}
      {(doc?.kind === 'chapter' || doc?.kind === 'part') && <ContainerInspector doc={doc} />}
      {(doc?.kind === 'character' || doc?.kind === 'world') && <EntityInspector doc={doc} />}
      {doc?.kind === 'map' && <MapInspector doc={doc} />}
      {doc?.kind === 'event' && (
        <section className="insp-section">
          <button className="btn ghost danger" onClick={() => confirmDelete(doc.id)}>
            Delete event
          </button>
        </section>
      )}
      {doc?.kind === 'subplot' && <IdeasFor id={doc.id} />}
      {doc?.kind === 'subplot' && (
        <section className="insp-section">
          <button className="btn ghost danger" onClick={() => confirmDelete(doc.id)}>
            Delete subplot
          </button>
          <p className="muted" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
            Scenes keep their text; only the subplot tags and beat notes go.
          </p>
        </section>
      )}
      {(!doc || doc.kind === 'scene' || doc.kind === 'chapter' || doc.kind === 'part' || doc.kind === 'submission' || doc.kind === 'market' || doc.kind === 'idea') && <ProjectSection />}
    </aside>
  );
}

function SceneInspector({ doc, short }: { doc: Doc; short: boolean }) {
  const words = useStore((s) => s.counts[doc.id] ?? 0);
  const status = (doc.fields.status as Status) ?? 'draft';
  const target = Number(doc.fields.target) || 0;
  const tags = Array.isArray(doc.fields.tags) ? (doc.fields.tags as string[]) : [];

  return (
    <>
      <section className="insp-section">
        <div className="insp-label">Status</div>
        <div className="status-picker" role="group" aria-label="Status">
          {STATUSES.map((st) => (
            <button key={st} aria-pressed={st === status} onClick={() => store.updateDoc(doc.id, { fields: { status: st } })}>
              <span className={`status-dot ${st}`} />
              {st}
            </button>
          ))}
        </div>
      </section>

      <SceneCast doc={doc} />
      <SceneSubplots doc={doc} />

      <section className="insp-section">
        <div className="insp-label">
          Words
          {target > 0 && <span className="hint">{Math.round((words / target) * 100)}% of target</span>}
        </div>
        <div className="big-number">
          {n(words)}
          {target > 0 && <small>of {n(target)}</small>}
        </div>
        {target > 0 && (
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (words / target) * 100)}%`, background: `var(--st-${status})` }} />
          </div>
        )}
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="target" style={{ color: 'var(--muted)', flex: 'none' }}>
            Target
          </label>
          <input
            id="target"
            className="input"
            type="number"
            min={0}
            step={100}
            placeholder="None"
            value={target || ''}
            onChange={(e) => store.updateDoc(doc.id, { fields: { target: e.target.value ? Math.max(0, Number(e.target.value)) : undefined } })}
          />
        </div>
      </section>

      {short && <LengthBands words={words} />}

      <StoryDateField doc={doc} />

      <section className="insp-section">
        <div className="insp-label">Tags</div>
        <TagEditor tags={tags} onChange={(t) => store.updateDoc(doc.id, { fields: { tags: t } })} />
      </section>

      <IdeasFor id={doc.id} />

      <SnapshotSection doc={doc} />

      <section className="insp-section">
        <div className="stat-row">
          <span className="k">Created</span>
          <span>{when(doc.fields.created)}</span>
        </div>
        <div className="stat-row">
          <span className="k">Last edited</span>
          <span>{when(doc.fields.updated)}</span>
        </div>
      </section>
    </>
  );
}

function LengthBands({ words }: { words: number }) {
  // Position the pin on a scale where each band takes equal width.
  const bands = LENGTH_BANDS.slice(0, 4);
  const band = lengthBand(words);
  let pos = 1;
  let lo = 0;
  for (let i = 0; i < bands.length; i++) {
    if (words < bands[i].max) {
      pos = (i + (words - lo) / (bands[i].max - lo)) / bands.length;
      break;
    }
    lo = bands[i].max;
  }
  return (
    <section className="insp-section">
      <div className="insp-label">
        Length
        <span className="hint">{band.name}</span>
      </div>
      <div className="bands" aria-label={`${band.name}, ${n(words)} words`}>
        {bands.map((b) => (
          <div key={b.name} className={b.name === band.name ? 'on' : ''}>
            {b.name.replace(' fiction', '')}
          </div>
        ))}
        <span className="pin" style={{ left: `calc(${pos * 100}% - 1px)` }} />
      </div>
      <div className="stat-row" style={{ marginTop: 6, fontSize: 11, color: 'var(--faint)' }}>
        <span>0</span>
        <span>1k</span>
        <span>7.5k</span>
        <span>17.5k</span>
        <span>40k</span>
      </div>
    </section>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange(t: string[]): void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };
  return (
    <div className="tags input" style={{ height: 'auto', minHeight: 34, padding: 4 }}>
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
          <button aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <IconX />
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        value={draft}
        placeholder={tags.length ? '' : 'Add a tag'}
        aria-label="Add a tag"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
      />
    </div>
  );
}

function ContainerInspector({ doc }: { doc: Doc }) {
  const binder = useStore((s) => s.project!.meta.binder);
  const docs = useStore((s) => s.project!.docs);
  const counts = useStore((s) => s.counts);
  const scenes = scenesUnder(binder, doc.id);
  const words = scenes.reduce((a, x) => a + (counts[x] ?? 0), 0);
  const byStatus = STATUSES.map((st) => ({ st, count: scenes.filter((x) => ((docs[x]?.fields.status as Status) ?? 'draft') === st).length }));
  return (
    <>
      <section className="insp-section">
        <div className="insp-label">
          Words
          <span className="hint">
            {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}
          </span>
        </div>
        <div className="big-number">{n(words)}</div>
      </section>
      {scenes.length > 0 && (
        <section className="insp-section">
          <div className="insp-label">Progress</div>
          <div className="meter" style={{ display: 'flex', height: 8, marginTop: 0 }} aria-hidden="true">
            {byStatus.map(({ st, count }) =>
              count ? <i key={st} style={{ width: `${(count / scenes.length) * 100}%`, background: `var(--st-${st})`, borderRadius: 0 }} /> : null,
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            {byStatus
              .filter((x) => x.count)
              .map(({ st, count }) => (
                <div key={st} className="stat-row">
                  <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`status-dot ${st}`} /> {st}
                  </span>
                  <span>{count}</span>
                </div>
              ))}
          </div>
        </section>
      )}
    </>
  );
}

function ProjectSection() {
  const goals = useStore((s) => s.project?.meta.goals);
  const counts = useStore((s) => s.counts);
  const todayStart = useStore((s) => s.todayStart);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const today = Math.max(0, total - todayStart);
  const goal = goals?.project ?? 0;
  const daily = goals?.daily ?? 0;
  return (
    <section className="insp-section">
      <div className="insp-label">Project</div>
      <div className="stat-row">
        <span className="k">Total</span>
        <span>
          {n(total)}
          {goal ? ` / ${n(goal)}` : ''}
        </span>
      </div>
      {goal > 0 && (
        <div className="meter" aria-hidden="true" style={{ marginBottom: 10 }}>
          <i style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} />
        </div>
      )}
      <div className="stat-row">
        <span className="k">Today</span>
        <span>
          {n(today)}
          {daily ? ` / ${n(daily)}` : ''}
        </span>
      </div>
      {daily > 0 && (
        <div className="meter" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (today / daily) * 100)}%`, background: 'var(--st-final)' }} />
        </div>
      )}
    </section>
  );
}

function useIndex() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => store.mentionIndex(), [docs, binder]);
}

function SceneCast({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const index = useIndex();
  const pov = typeof doc.fields.pov === 'string' ? doc.fields.pov : null;
  const location = typeof doc.fields.location === 'string' ? doc.fields.location : null;
  const present = [...(index.byScene.get(doc.id) ?? [])].map((id) => docs[id]).filter(Boolean);
  const people = present.filter((d) => d.kind === 'character');
  const places = present.filter((d) => d.kind === 'world');
  return (
    <section className="insp-section">
      <div className="insp-label">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPov width={13} height={13} /> Point of view
        </span>
      </div>
      <Picker
        label="Point of view"
        placeholder="Choose a character"
        value={pov}
        clearable
        options={characterOptions(docs)}
        onCreate={(name) => store.addCharacter(name, {}, { select: false })}
        createLabel="New character"
        onChange={(id) => store.updateDoc(doc.id, { fields: { pov: id ?? undefined } })}
      />
      <div className="insp-label" style={{ marginTop: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlace width={13} height={13} /> Location
        </span>
      </div>
      <Picker
        label="Location"
        placeholder="Choose a place"
        value={location}
        clearable
        options={worldOptions(docs)}
        onCreate={(name) => store.addWorld('place', name, null, { select: false })}
        createLabel="New place"
        onChange={(id) => store.updateDoc(doc.id, { fields: { location: id ?? undefined } })}
      />
      {(people.length > 0 || places.length > 0) && (
        <>
          <div className="insp-label" style={{ marginTop: 14 }}>
            In this scene <span className="hint">from names and @links</span>
          </div>
          <div className="chips">
            {people.map((d) => (
              <button key={d.id} className="chip" onClick={() => store.select(d.id)}>
                <Avatar id={d.id} name={d.title} size={18} /> {d.title}
              </button>
            ))}
            {places.map((d) => {
              const I = WORLD_ICON[worldKindOf(d)];
              return (
                <button key={d.id} className="chip" onClick={() => store.select(d.id)}>
                  <I width={13} height={13} /> {d.title}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function EntityInspector({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const index = useIndex();
  const apps = index.byEntity.get(doc.id) ?? [];
  const total = apps.reduce((a, x) => a + x.count, 0);
  const povCount = apps.filter((a) => a.pov).length;
  const chapterOf = (sceneId: string) => {
    const p = parentOf(binder, sceneId);
    return p ? docs[p.id]?.title : undefined;
  };
  const label = doc.kind === 'character' ? 'Appears in' : 'Mentioned in';
  return (
    <>
      <section className="insp-section">
        <div className="insp-label">
          {label}
          <span className="hint">
            {apps.length} {apps.length === 1 ? 'scene' : 'scenes'}
          </span>
        </div>
        {apps.length === 0 ? (
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Not in any scene yet. Write the name in a scene, or type @ to link it.
          </p>
        ) : (
          <>
            <div className="stat-row">
              <span className="k">Mentions</span>
              <span>{total}</span>
            </div>
            {doc.kind === 'character' && (
              <div className="stat-row">
                <span className="k">Point of view</span>
                <span>{povCount}</span>
              </div>
            )}
            <ol className="appear-list">
              {apps.map((a) => {
                const s = docs[a.sceneId];
                return (
                  <li key={a.sceneId}>
                    <button onClick={() => store.select(a.sceneId)}>
                      <span className="ap-title">{s?.title || 'Untitled scene'}</span>
                      <span className="ap-sub">
                        {chapterOf(a.sceneId) ?? ''}
                        {a.pov && <span className="badge">POV</span>}
                        {a.location && <span className="badge">setting</span>}
                        {a.linked && <span className="badge">linked</span>}
                      </span>
                      <span className="ap-count" title="Mentions">
                        {a.count || ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
      <OnMaps id={doc.id} />
      <IdeasFor id={doc.id} />
      {doc.kind === 'world' && (
        <section className="insp-section">
          <div className="stat-row">
            <span className="k">Type</span>
            <span>{WORLD_TEMPLATES[worldKindOf(doc)].label}</span>
          </div>
        </section>
      )}
      <section className="insp-section">
        <button className="btn ghost danger" onClick={() => confirmDelete(doc.id)}>
          Move to trash
        </button>
      </section>
    </>
  );
}

function SceneSubplots({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const ids = sceneSubplots(doc, docs);
  return (
    <section className="insp-section">
      <div className="insp-label">Subplots</div>
      {ids.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {ids.map((id) => (
            <span key={id} className="chip">
              <SubplotSwatch color={subplotColorOf(docs[id])} />
              <button className="link-btn" onClick={() => store.select(id)}>
                {docs[id].title}
              </button>
              <button className="chip-x" aria-label={`Remove ${docs[id].title}`} onClick={() => store.setSceneSubplot(doc.id, id, false)}>
                <IconX />
              </button>
            </span>
          ))}
        </div>
      )}
      <Picker
        compact
        label="Add subplot"
        placeholder="Add a subplot"
        value={null}
        options={subplotOptions(docs).filter((o) => !ids.includes(o.id))}
        onCreate={(name) => store.addSubplot(name, { select: false })}
        createLabel="New subplot"
        onChange={(id) => id && store.setSceneSubplot(doc.id, id, true)}
      />
    </section>
  );
}
