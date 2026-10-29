import { useEffect, useMemo, useRef } from 'react';
import { parentOf } from '../../model/binder';
import {
  analyzeSubplots,
  beatsOf,
  subplotCharacters,
  subplotColorOf,
  subplotStatusOf,
  SUBPLOT_COLORS,
  SUBPLOT_STATUSES,
  warningText,
} from '../../model/subplots';
import type { Doc } from '../../model/types';
import { store, useStore } from '../../store/store';
import { IconAlert, IconX } from '../icons';
import { useEntityLinking } from '../linking';
import { AutoTextarea } from '../Page';
import { Avatar, characterOptions, Picker, sceneOptions } from '../pickers';
import { ProseEditor } from '../ProseEditor';

const STATUS_LABEL: Record<string, string> = { setup: 'Setting up', rising: 'Rising', resolved: 'Resolved', abandoned: 'Dropped' };

export function SubplotPage({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const rev = useStore((s) => s.externalRev);
  const renaming = useStore((s) => s.renamingId === doc.id);
  const linking = useEntityLinking();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (renaming && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
      store.setRenaming(null);
    }
  }, [renaming]);
  const analysis = useMemo(() => analyzeSubplots(binder, docs).get(doc.id), [binder, docs, doc.id]);
  const color = subplotColorOf(doc);
  const status = subplotStatusOf(doc);
  const chars = subplotCharacters(doc);
  const scenes = analysis?.scenes ?? [];
  const notIn = sceneOptions(docs, binder).filter((o) => !scenes.includes(o.id));
  const warnings = (analysis?.warnings ?? []).filter((w) => w.kind !== 'unresolved');

  return (
    <article className="page entity-page" style={{ ['--c' as string]: `var(--sp-${color})` }}>
      <header className="ent-head">
        <span className="sp-glyph" aria-hidden="true" />
        <div className="ent-head-main">
          <AutoTextarea
            ref={titleRef}
            className="title-input ent-title"
            value={doc.title}
            placeholder="Subplot name"
            aria-label="Subplot name"
            onChange={(e) => store.updateDoc(doc.id, { title: e.target.value.replace(/\n/g, ' ') })}
          />
          <div className="swatches" role="radiogroup" aria-label="Color">
            {Array.from({ length: SUBPLOT_COLORS }, (_, i) => (
              <button
                key={i}
                role="radio"
                aria-checked={i === color}
                aria-label={`Color ${i + 1}`}
                className="swatch"
                style={{ background: `var(--sp-${i})` }}
                onClick={() => store.updateDoc(doc.id, { fields: { color: i } })}
              />
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Status" style={{ alignSelf: 'flex-start' }}>
            {SUBPLOT_STATUSES.map((s) => (
              <button key={s} aria-pressed={s === status} onClick={() => store.updateDoc(doc.id, { fields: { status: s } })}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {warnings.length > 0 && (
        <div className="callout" role="status">
          <IconAlert />
          <span>{warnings.map(warningText).join('. ')}.</span>
        </div>
      )}

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Characters involved</h2>
        </div>
        <div className="chips">
          {chars
            .filter((id) => docs[id])
            .map((id) => (
              <span key={id} className="chip">
                <Avatar id={id} name={docs[id].title} size={18} />
                <button className="link-btn" onClick={() => store.select(id)}>
                  {docs[id].title}
                </button>
                <button className="chip-x" aria-label={`Remove ${docs[id].title}`} onClick={() => store.updateDoc(doc.id, { fields: { characters: chars.filter((c) => c !== id) } })}>
                  <IconX />
                </button>
              </span>
            ))}
          <div style={{ width: 220 }}>
            <Picker
              compact
              label="Add character"
              placeholder="Add a character"
              value={null}
              options={characterOptions(docs).filter((o) => !chars.includes(o.id))}
              onCreate={(name) => store.addCharacter(name, {}, { select: false })}
              createLabel="New character"
              onChange={(id) => id && store.updateDoc(doc.id, { fields: { characters: [...chars, id] } })}
            />
          </div>
        </div>
      </section>

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Through the story</h2>
          <span className="hint">
            {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}
          </span>
        </div>
        <ol className="thread-list">
          {scenes.map((sid) => {
            const s = docs[sid];
            const ch = parentOf(binder, sid);
            return (
              <li key={sid}>
                <div className="thread-head">
                  <button className="link-btn thread-title" onClick={() => store.select(sid)}>
                    {s.title || 'Untitled scene'}
                  </button>
                  <span className="muted">{ch ? docs[ch.id]?.title : ''}</span>
                  <button className="icon-btn row-x" aria-label="Remove from this scene" onClick={() => store.setSceneSubplot(sid, doc.id, false)}>
                    <IconX />
                  </button>
                </div>
                <AutoTextarea
                  className="thread-note"
                  value={beatsOf(s)[doc.id] ?? ''}
                  placeholder="What happens to this thread here?"
                  aria-label={`Beat in ${s.title}`}
                  onChange={(e) => store.setBeat(sid, doc.id, e.target.value.replace(/\n/g, ' '))}
                />
              </li>
            );
          })}
          <li className="thread-add">
            <div style={{ width: 260 }}>
              <Picker compact label="Add to a scene" placeholder="Add to a scene" value={null} options={notIn} onChange={(id) => id && store.setSceneSubplot(id, doc.id, true)} />
            </div>
          </li>
        </ol>
      </section>

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Summary</h2>
          <span className="hint">The question this thread asks, and how it is answered</span>
        </div>
        <ProseEditor
          docId={doc.id}
          markdown={doc.body}
          rev={rev}
          onChange={(md, id) => store.updateDoc(id, { body: md })}
          placeholder="Will Mara find out who paid Oren’s debt?"
          className="no-indent entity-prose"
          {...linking}
        />
      </section>
    </article>
  );
}
