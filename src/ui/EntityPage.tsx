import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  aliasesOf,
  arcOf,
  listField,
  parentOfEntity,
  profileFrom,
  profileOf,
  relationshipsOf,
  roleOf,
  ROLE_LABEL,
  worldKindOf,
  WORLD_TEMPLATES,
  type Relationship,
} from '../model/entities';
import { ROLES, WORLD_KINDS, type Doc, type Role, type WorldKind } from '../model/types';
import { store, useStore } from '../store/store';
import { IconAddImage, IconPlus, IconX, WORLD_ICON } from './icons';
import { choosePortrait, Gallery } from './Gallery';
import { AutoTextarea } from './Page';
import { Avatar, characterOptions, Picker, sceneOptions, worldOptions } from './pickers';
import { ProseEditor } from './ProseEditor';
import { useEntityLinking } from './linking';

// ---------- shared pieces ----------

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="ent-section">
      <div className="ent-section-head">
        <h2>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </section>
  );
}

/** Ordered label/value pairs saved as the `profile` map in frontmatter. */
function ProfileGrid({ doc }: { doc: Doc }) {
  const rows = profileOf(doc);
  const [adding, setAdding] = useState(false);
  const save = (next: [string, string][]) => store.updateDoc(doc.id, { fields: { profile: profileFrom(next) } });
  return (
    <div className="profile">
      {rows.map(([k, v], i) => (
        <div className="profile-row" key={k + i}>
          <input
            className="profile-key"
            defaultValue={k}
            aria-label="Field name"
            onBlur={(e) => {
              const nk = e.target.value.trim();
              if (nk && nk !== k && !rows.some(([x]) => x === nk)) save(rows.map((r, j) => (j === i ? [nk, r[1]] : r)));
              else e.target.value = k;
            }}
          />
          <AutoTextarea className="profile-val" value={v} placeholder="—" aria-label={k} onChange={(e) => save(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <button className="icon-btn row-x" aria-label={`Remove ${k}`} title="Remove field" onClick={() => save(rows.filter((_, j) => j !== i))}>
            <IconX />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="profile-row">
          <input
            className="profile-key"
            autoFocus
            placeholder="Field name"
            aria-label="New field name"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false);
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              const nk = e.target.value.trim();
              if (nk && !rows.some(([x]) => x === nk)) save([...rows, [nk, '']]);
              setAdding(false);
            }}
          />
        </div>
      ) : (
        <button className="add-link" onClick={() => setAdding(true)}>
          <IconPlus /> Add field
        </button>
      )}
    </div>
  );
}

function ListEditor({ items, onChange, placeholder, addLabel }: { items: string[]; onChange(v: string[]): void; placeholder: string; addLabel: string }) {
  return (
    <div className="list-editor">
      {items.map((it, i) => (
        <div className="list-row" key={i}>
          <span className="list-bullet" aria-hidden="true" />
          <AutoTextarea className="list-input" value={it} placeholder={placeholder} aria-label={`${addLabel} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="icon-btn row-x" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <IconX />
          </button>
        </div>
      ))}
      <button className="add-link" onClick={() => onChange([...items, ''])}>
        <IconPlus /> {addLabel}
      </button>
    </div>
  );
}

function useFocusTitleOnCreate(id: string, ref: React.RefObject<HTMLTextAreaElement | null>) {
  const renaming = useStore((s) => s.renamingId === id);
  useEffect(() => {
    if (renaming && ref.current) {
      ref.current.focus();
      ref.current.select();
      store.setRenaming(null);
    }
  }, [renaming, ref]);
}

function BodyEditor({ doc, placeholder }: { doc: Doc; placeholder: string }) {
  const rev = useStore((s) => s.externalRev);
  const linking = useEntityLinking();
  return (
    <ProseEditor
      docId={doc.id}
      markdown={doc.body}
      rev={rev}
      onChange={(md, id) => store.updateDoc(id, { body: md })}
      placeholder={placeholder}
      className="no-indent entity-prose"
      {...linking}
    />
  );
}

// ---------- character ----------

const REL_KINDS = ['sibling', 'parent', 'child', 'partner', 'spouse', 'friend', 'ally', 'rival', 'enemy', 'mentor', 'student', 'employer', 'employee'];

export function CharacterPage({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useFocusTitleOnCreate(doc.id, titleRef);
  const role = roleOf(doc);
  const arc = arcOf(doc);
  const rels = relationshipsOf(doc);
  const setArc = (patch: Partial<typeof arc>) => store.updateDoc(doc.id, { fields: { arc: { ...arc, ...patch } } });
  const setRels = (next: Relationship[]) => store.updateDoc(doc.id, { fields: { relationships: next.map((r) => ({ to: r.to, kind: r.kind || undefined, note: r.note || undefined })) } });
  const [aliasDraft, setAliasDraft] = useState(aliasesOf(doc).join(', '));
  useLayoutEffect(() => setAliasDraft(aliasesOf(doc).join(', ')), [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const others = characterOptions(docs).filter((o) => o.id !== doc.id);
  const scenes = sceneOptions(docs, binder);

  return (
    <article className="page entity-page">
      <header className="ent-head">
        <button className="portrait-btn" onClick={() => void choosePortrait(doc)} title="Choose a portrait" aria-label="Choose a portrait">
          <Avatar id={doc.id} name={doc.title || '?'} size={84} />
          <span className="portrait-edit" aria-hidden="true">
            <IconAddImage />
          </span>
        </button>
        <div className="ent-head-main">
          <AutoTextarea
            ref={titleRef}
            className="title-input ent-title"
            value={doc.title}
            placeholder="Character name"
            aria-label="Name"
            onChange={(e) => store.updateDoc(doc.id, { title: e.target.value.replace(/\n/g, ' ') })}
          />
          <input
            className="ent-sub-input"
            value={aliasDraft}
            placeholder="Also known as (comma separated)"
            aria-label="Aliases"
            onChange={(e) => setAliasDraft(e.target.value)}
            onBlur={() =>
              store.updateDoc(doc.id, {
                fields: {
                  aliases: aliasDraft
                    .split(',')
                    .map((a) => a.trim())
                    .filter(Boolean),
                },
              })
            }
          />
          <div className="segmented role-picker" role="group" aria-label="Role">
            {ROLES.map((r: Role) => (
              <button key={r} aria-pressed={r === role} onClick={() => store.updateDoc(doc.id, { fields: { role: r } })}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="ent-grid">
        <Section title="Profile">
          <ProfileGrid doc={doc} />
        </Section>

        <Section title="Arc" hint="Who they are at the start, who they become">
          <div className="arc">
            <label className="arc-end">
              <span>Starts</span>
              <AutoTextarea className="input" value={arc.start ?? ''} placeholder="e.g. Trusts no one" onChange={(e) => setArc({ start: e.target.value })} />
            </label>
            <ol className="arc-beats">
              {(arc.beats ?? []).map((b, i) => (
                <li key={i}>
                  <AutoTextarea
                    className="beat-label"
                    value={b.label}
                    placeholder="Turning point"
                    aria-label={`Turning point ${i + 1}`}
                    onChange={(e) => setArc({ beats: arc.beats!.map((x, j) => (j === i ? { ...x, label: e.target.value.replace(/\n/g, ' ') } : x)) })}
                  />
                  <Picker
                    compact
                    label="Scene"
                    placeholder="Link a scene"
                    value={b.scene ?? null}
                    options={scenes}
                    clearable
                    onChange={(id) => setArc({ beats: arc.beats!.map((x, j) => (j === i ? { ...x, scene: id ?? undefined } : x)) })}
                  />
                  <button className="icon-btn row-x" aria-label="Remove turning point" onClick={() => setArc({ beats: arc.beats!.filter((_, j) => j !== i) })}>
                    <IconX />
                  </button>
                </li>
              ))}
              <li className="arc-add">
                <button className="add-link" onClick={() => setArc({ beats: [...(arc.beats ?? []), { label: '' }] })}>
                  <IconPlus /> Add turning point
                </button>
              </li>
            </ol>
            <label className="arc-end">
              <span>Ends</span>
              <AutoTextarea className="input" value={arc.end ?? ''} placeholder="e.g. Leads the caravan" onChange={(e) => setArc({ end: e.target.value })} />
            </label>
          </div>
        </Section>
      </div>

      <Section title="Relationships">
        <div className="rels">
          {rels.map((r, i) => (
            <div className="rel-row" key={i}>
              <Picker
                compact
                label="Character"
                placeholder="Choose character"
                value={r.to}
                options={others}
                onCreate={(name) => store.addCharacter(name, {}, { select: false })}
                createLabel="New character"
                onChange={(id) => id && setRels(rels.map((x, j) => (j === i ? { ...x, to: id } : x)))}
              />
              <input
                className="input rel-kind"
                list="rel-kinds"
                value={r.kind ?? ''}
                placeholder="sibling, rival…"
                aria-label="Relationship"
                onChange={(e) => setRels(rels.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
              />
              <input
                className="input rel-note"
                value={r.note ?? ''}
                placeholder="Note"
                aria-label="Note"
                onChange={(e) => setRels(rels.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              />
              <button className="icon-btn row-x" aria-label="Remove relationship" onClick={() => setRels(rels.filter((_, j) => j !== i))}>
                <IconX />
              </button>
            </div>
          ))}
          {others.length > 0 || rels.length > 0 ? (
            <button className="add-link" onClick={() => setRels([...rels, { to: others[0]?.id ?? '' }])}>
              <IconPlus /> Add relationship
            </button>
          ) : (
            <p className="muted">Add another character to record how they relate.</p>
          )}
          <datalist id="rel-kinds">
            {REL_KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
      </Section>

      <Section title="Images" hint="Portraits, reference photos, mood boards">
        <Gallery doc={doc} />
      </Section>

      <Section title="Biography" hint="Type @ to link a character or place">
        <BodyEditor doc={doc} placeholder="History, wants, wounds, the lie they believe…" />
      </Section>
    </article>
  );
}

// ---------- world ----------

export function WorldPage({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useFocusTitleOnCreate(doc.id, titleRef);
  const kind = worldKindOf(doc);
  const tpl = WORLD_TEMPLATES[kind];
  const Icon = WORLD_ICON[kind];
  const parent = parentOfEntity(doc);
  const children = Object.values(docs)
    .filter((d) => d.kind === 'world' && parentOfEntity(d) === doc.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  // A parent can't be this entry or anything inside it.
  const descendants = new Set<string>([doc.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of Object.values(docs)) {
      const p = parentOfEntity(d);
      if (p && descendants.has(p) && !descendants.has(d.id)) {
        descendants.add(d.id);
        grew = true;
      }
    }
  }
  const chain: Doc[] = [];
  for (let p = parent; p && docs[p] && chain.length < 20; p = parentOfEntity(docs[p])) chain.unshift(docs[p]);

  return (
    <article className="page entity-page">
      <nav className="crumbs" aria-label="Location">
        {chain.map((d, i) => (
          <span key={d.id} style={{ display: 'contents' }}>
            {i > 0 && <span aria-hidden="true">/</span>}
            <button onClick={() => store.select(d.id)}>{d.title || 'Untitled'}</button>
          </span>
        ))}
      </nav>
      <header className="ent-head">
        <span className="ent-glyph" aria-hidden="true">
          <Icon />
        </span>
        <div className="ent-head-main">
          <AutoTextarea
            ref={titleRef}
            className="title-input ent-title"
            value={doc.title}
            placeholder={`${tpl.label} name`}
            aria-label="Name"
            onChange={(e) => store.updateDoc(doc.id, { title: e.target.value.replace(/\n/g, ' ') })}
          />
          <input
            className="ent-sub-input"
            value={String(doc.fields.pronunciation ?? '')}
            placeholder="Pronunciation, e.g. SAL-ter-ee"
            aria-label="Pronunciation"
            onChange={(e) => store.updateDoc(doc.id, { fields: { pronunciation: e.target.value } })}
          />
          <div className="ent-meta-row">
            <label className="field">
              <span className="muted">Type</span>
              <select className="input" value={kind} onChange={(e) => store.updateDoc(doc.id, { fields: { kind: e.target.value as WorldKind } })}>
                {WORLD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {WORLD_TEMPLATES[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="muted">Inside</span>
              <Picker
                compact
                label="Parent entry"
                placeholder="Nothing (top level)"
                value={parent}
                clearable
                options={worldOptions(docs, (d) => !descendants.has(d.id))}
                onChange={(id) => store.updateDoc(doc.id, { fields: { parent: id ?? undefined } })}
              />
            </label>
          </div>
        </div>
      </header>

      <div className="ent-grid">
        <Section title="Details">
          <ProfileGrid doc={doc} />
        </Section>
        <Section title="Contains" hint={children.length ? `${children.length}` : undefined}>
          <div className="child-list">
            {children.map((c) => {
              const CI = WORLD_ICON[worldKindOf(c)];
              return (
                <button key={c.id} className="child-chip" onClick={() => store.select(c.id)}>
                  <CI /> {c.title || 'Untitled'}
                </button>
              );
            })}
            <button className="add-link" onClick={() => store.addWorld(kind === 'place' ? 'place' : 'other', undefined, doc.id)}>
              <IconPlus /> Add {kind === 'place' ? 'a place' : 'an entry'} inside
            </button>
          </div>
        </Section>
      </div>

      {tpl.rules && (
        <div className="ent-grid three">
          {(['rules', 'costs', 'limits'] as const).map((key) => (
            <Section key={key} title={key === 'rules' ? 'Rules' : key === 'costs' ? 'Costs' : 'Limits'}>
              <ListEditor
                items={listField(doc, key)}
                onChange={(v) => store.updateDoc(doc.id, { fields: { [key]: v } })}
                placeholder={key === 'rules' ? 'What always holds' : key === 'costs' ? 'What it takes from the user' : 'What it can never do'}
                addLabel={key === 'rules' ? 'Add rule' : key === 'costs' ? 'Add cost' : 'Add limit'}
              />
            </Section>
          ))}
        </div>
      )}

      <Section title="Images" hint="Sketches, reference photos, plans">
        <Gallery doc={doc} />
      </Section>

      <Section title="Description" hint="Type @ to link a character or place">
        <BodyEditor doc={doc} placeholder="What a traveler would notice first, and what only locals know…" />
      </Section>
    </article>
  );
}
