import { useEffect, useMemo, useRef, useState } from 'react';
import { kindOf } from '../../model/ids';
import { detectLinks, guessType, ideaLinks, ideaOf, relatedIdeas, suggestPlacements, useOptions, IDEA_STATUSES, IDEA_STATUS_LABEL, IDEA_TYPES, IDEA_TYPE_LABEL, type Idea, type IdeaType } from '../../model/ideas';
import { worldKindOf } from '../../model/entities';
import { parentOf } from '../../model/binder';
import type { Doc } from '../../model/types';
import { store, useStore } from '../../store/store';
import { askClaude, assistant, type ClaudeSort } from '../../ideas/ai';
import {
  IconArchive,
  IconCharacter,
  IconCheck,
  IconChapter,
  IconIdea,
  IconPin,
  IconPlace,
  IconPlus,
  IconQuote,
  IconScene,
  IconSparkle,
  IconSticky,
  IconSubplot,
  IconTimeline,
  IconTrash,
  IconWand,
  IconWorld,
  IconX,
  WORLD_ICON,
} from '../icons';
import { useEntityLinking } from '../linking';
import { Avatar, characterOptions, Picker, sceneOptions, worldOptions, type PickOption } from '../pickers';
import { subplotOptions } from '../plan/shared';
import { ProseEditor } from '../ProseEditor';
import { confirmDelete } from '../Binder';
import { ideasUi, useIdeasUi, type IdeasView } from './ideasUi';

// ---------- shared bits ----------

export const TYPE_ICON: Record<IdeaType, React.ComponentType<{ width?: number; height?: number; className?: string }>> = {
  character: IconCharacter,
  plot: IconSubplot,
  place: IconPlace,
  world: IconWorld,
  event: IconTimeline,
  scene: IconScene,
  line: IconQuote,
  theme: IconSparkle,
  other: IconSticky,
};

const USE_LABEL = { scene: 'As a scene', character: 'As a character', place: 'As a place', world: 'As a world entry', event: 'On the timeline', subplot: 'As a subplot' } as const;

function useIdeas() {
  const docs = useStore((s) => s.project!.docs);
  return useMemo(
    () =>
      Object.values(docs)
        .filter((d) => d.kind === 'idea')
        .map(ideaOf)
        .sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id)),
    [docs],
  );
}

export function TypeTag({ type, auto, onPick }: { type: IdeaType; auto?: boolean; onPick?(t: IdeaType): void }) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[type];
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="it-wrap" ref={ref}>
      <button
        type="button"
        className={`it-tag it-${type}`}
        title={auto ? 'Sorted automatically. Click to change.' : 'Click to change'}
        aria-label={`Kind of idea: ${IDEA_TYPE_LABEL[type]}${auto ? ' (guessed)' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (onPick) setOpen(!open);
        }}
      >
        <Icon width={12} height={12} /> {IDEA_TYPE_LABEL[type]}
        {auto && <i className="it-auto" aria-hidden="true" />}
      </button>
      {open && onPick && (
        <span className="it-menu" role="menu" onClick={(e) => e.stopPropagation()}>
          {IDEA_TYPES.map((t) => {
            const I = TYPE_ICON[t];
            return (
              <button
                key={t}
                role="menuitem"
                className={`it-${t}`}
                aria-current={t === type}
                onClick={() => {
                  onPick(t);
                  setOpen(false);
                }}
              >
                <I width={14} height={14} /> {IDEA_TYPE_LABEL[t]}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

function DocIcon({ d }: { d: Doc }) {
  if (d.kind === 'character') return <Avatar id={d.id} name={d.title} size={16} />;
  if (d.kind === 'world') {
    const I = WORLD_ICON[worldKindOf(d)];
    return <I width={13} height={13} />;
  }
  if (d.kind === 'subplot') return <IconSubplot width={13} height={13} />;
  if (d.kind === 'event') return <IconTimeline width={13} height={13} />;
  if (d.kind === 'chapter') return <IconChapter width={13} height={13} />;
  return <IconScene width={13} height={13} />;
}

function LinkChip({ id, onRemove, small }: { id: string; onRemove?(): void; small?: boolean }) {
  const d = useStore((s) => s.project!.docs[id]);
  if (!d) return null;
  return (
    <span className={`chip idea-chip ${small ? 'small' : ''}`}>
      <button
        type="button"
        className="chip-main"
        onClick={(e) => {
          e.stopPropagation();
          store.select(id);
        }}
        title={`Open ${d.title}`}
      >
        <DocIcon d={d} />
        {d.title || 'Untitled'}
      </button>
      {onRemove && (
        <button
          type="button"
          className="chip-x"
          aria-label={`Not about ${d.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <IconX />
        </button>
      )}
    </span>
  );
}

function placeLabel(id: string, docs: Record<string, Doc>, binder: Parameters<typeof parentOf>[0]) {
  const d = docs[id];
  if (!d) return '';
  const ch = d.kind === 'scene' ? parentOf(binder, id) : null;
  return ch && docs[ch.id] ? `${d.title} · ${docs[ch.id].title}` : d.title;
}

// ---------- capture ----------

/** What the analyzer makes of text as it is typed. */
function LiveSort({ text }: { text: string }) {
  const docs = useStore((s) => s.project!.docs);
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setShown(text), 180);
    return () => clearTimeout(t);
  }, [text]);
  const links = useMemo(() => detectLinks(shown, docs).slice(0, 5), [shown, docs]);
  const guess = useMemo(() => guessType(shown, links.map((id) => docs[id])), [shown, links, docs]);
  if (!shown.trim()) return <p className="cap-hint">Inkwell sorts it as you type: what kind of idea it is and who or what it’s about.</p>;
  return (
    <div className="cap-live" aria-live="polite">
      <TypeTag type={guess.type} auto />
      {links.length > 0 && <span className="cap-about">about</span>}
      {links.map((id) => (
        <LinkChip key={id} id={id} small />
      ))}
    </div>
  );
}

async function sortWithClaude(id: string) {
  const p = store.get().project;
  const doc = p?.docs[id];
  if (!p || !doc) return null;
  const res = await askClaude(doc.body, p.docs, p.meta.binder);
  const cur = store.get().project?.docs[id];
  if (!cur) return res;
  const idea = ideaOf(cur);
  const fields: Record<string, unknown> = {};
  if (idea.typeAuto) fields.ideaType = res.type;
  const extra = res.links.filter((x) => !ideaLinks(idea, store.get().project!.docs).includes(x));
  if (extra.length) fields.links = [...idea.links, ...extra];
  if (!idea.target && res.target) fields.target = res.target;
  fields.claude = { why: res.why, questions: res.questions };
  store.updateDoc(id, { fields });
  return res;
}

export function CaptureDialog() {
  const forId = useStore((s) => s.captureFor);
  const forDoc = useStore((s) => (s.captureFor ? s.project?.docs[s.captureFor] : undefined));
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const save = () => {
    const t = text.trim();
    if (!t) return store.setCapture(false);
    const id = store.addIdea(t, { links: forId ? [forId] : [], target: forId && kindOf(forId) === 'scene' ? forId : null });
    store.setCapture(false);
    store.toast('Idea saved. Find it under Ideas (Ctrl+8).');
    if (id && assistant.enabled() && assistant.auto()) sortWithClaude(id).catch((e) => store.toast((e as Error).message));
  };
  return (
    <>
      <div className="scrim" onClick={save} />
      <div className="dialog capture" role="dialog" aria-label="Jot down an idea">
        <div className="cap-head">
          <IconIdea width={18} height={18} className="cap-bulb" />
          <h2>Jot down an idea</h2>
          {forDoc && (
            <span className="cap-for">
              about <LinkChip id={forDoc.id} small />
            </span>
          )}
        </div>
        <textarea
          ref={ref}
          className="cap-text"
          value={text}
          rows={4}
          aria-label="Idea"
          placeholder="What if the stranger knew Oren as a boy…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              store.setCapture(false);
            }
          }}
        />
        <LiveSort text={text} />
        <div className="cap-foot">
          <span className="muted">
            <kbd>Enter</kbd> saves · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> discards
          </span>
          <button className="btn primary" onClick={save} disabled={!text.trim()}>
            Save idea
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- card ----------

function IdeaCard({ idea }: { idea: Idea }) {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const links = ideaLinks(idea, docs);
  const index = useMemo(() => store.mentionIndex(), [docs, binder]);
  const fit = idea.target ? null : idea.status === 'new' || idea.status === 'kept' ? suggestPlacements(idea, docs, binder, index, 1)[0] : undefined;
  const body = idea.text.replace(/\[([^\]]*)\]\(ink:[a-z0-9_]+\)/g, '$1');
  const rest = body.slice(body.indexOf(idea.title.replace(/…$/, '')) + idea.title.length).replace(/^[\s.!?]+/, '');
  const used = idea.usedIn ? docs[idea.usedIn] : undefined;
  return (
    <article className={`idea-card ${idea.status}`} onClick={() => store.select(idea.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && store.select(idea.id)} aria-label={idea.title}>
      <header>
        <TypeTag type={idea.type} auto={idea.typeAuto} onPick={(t) => store.setIdeaType(idea.id, t)} />
        {idea.status !== 'new' && <span className={`ic-status ${idea.status}`}>{IDEA_STATUS_LABEL[idea.status]}</span>}
      </header>
      <h3>{idea.title || 'Untitled idea'}</h3>
      {rest && <p className="ic-body">{rest}</p>}
      {links.length > 0 && (
        <div className="ic-links">
          {links.slice(0, 4).map((id) => (
            <LinkChip key={id} id={id} small />
          ))}
          {links.length > 4 && <span className="muted">+{links.length - 4}</span>}
        </div>
      )}
      {idea.target && docs[idea.target] && (
        <p className="ic-fit pinned">
          <IconPin width={12} height={12} /> {placeLabel(idea.target, docs, binder)}
        </p>
      )}
      {fit && (
        <p className="ic-fit">
          <span>
            Might fit <strong>{placeLabel(fit.id, docs, binder)}</strong>
          </span>
          <button
            className="ic-pin"
            onClick={(e) => {
              e.stopPropagation();
              store.updateDoc(idea.id, { fields: { target: fit.id } });
            }}
            title={`Pin to ${docs[fit.id]?.title}: ${fit.why}`}
          >
            <IconPin width={12} height={12} /> Pin
          </button>
        </p>
      )}
      {used && (
        <p className="ic-fit used">
          <IconCheck width={12} height={12} /> Used in <strong>{used.title}</strong>
        </p>
      )}
      {(idea.status === 'new' || idea.status === 'kept') && (
        <footer onClick={(e) => e.stopPropagation()}>
          {idea.status === 'new' && (
            <button className="ic-act" onClick={() => store.updateDoc(idea.id, { fields: { status: 'kept' } })}>
              <IconCheck width={13} height={13} /> Keep
            </button>
          )}
          <button className="ic-act" onClick={() => store.useIdea(idea.id, useOptions(idea.type)[0])}>
            <IconPlus width={13} height={13} /> {USE_LABEL[useOptions(idea.type)[0]]}
          </button>
          <span style={{ flex: 1 }} />
          <button className="ic-act quiet" aria-label="Set aside" title="Set aside" onClick={() => store.updateDoc(idea.id, { fields: { status: 'dropped' } })}>
            <IconArchive width={13} height={13} />
          </button>
        </footer>
      )}
    </article>
  );
}

// ---------- overview ----------

export function IdeasPage() {
  const ideas = useIdeas();
  const docs = useStore((s) => s.project!.docs);
  const ui = useIdeasUi();
  const [text, setText] = useState('');
  const shown = ideas.filter(
    (i) =>
      (ui.status === 'all' ? true : i.status === ui.status) &&
      (!ui.type || i.type === ui.type) &&
      (!ui.query || `${i.title} ${i.text}`.toLowerCase().includes(ui.query.toLowerCase())),
  );
  const groups = useMemo(() => {
    if (ui.view === 'inbox') return [{ key: 'all', title: '', items: shown }];
    if (ui.view === 'type')
      return IDEA_TYPES.map((t) => ({ key: t, title: IDEA_TYPE_LABEL[t], type: t, items: shown.filter((i) => i.type === t) })).filter((g) => g.items.length);
    // By who and where: one group per character, place, subplot; an idea can sit in several.
    const map = new Map<string, Idea[]>();
    const loose: Idea[] = [];
    for (const i of shown) {
      const ls = ideaLinks(i, docs).filter((id) => ['character', 'world', 'subplot'].includes(kindOf(id) ?? ''));
      if (!ls.length) loose.push(i);
      for (const id of ls) map.set(id, [...(map.get(id) ?? []), i]);
    }
    const rank = (id: string) => ['character', 'world', 'subplot'].indexOf(kindOf(id) ?? '');
    const out = [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length).map(([id, items]) => ({ key: id, title: docs[id]?.title ?? '', entity: id, items }));
    if (loose.length) out.push({ key: 'loose', title: 'Not about anyone or anywhere yet', entity: '', items: loose });
    return out;
  }, [shown, ui.view, docs]);
  const counts = Object.fromEntries(IDEA_STATUSES.map((s) => [s, ideas.filter((i) => i.status === s).length]));

  const save = () => {
    const id = store.addIdea(text);
    setText('');
    if (id && ui.status !== 'new' && ui.status !== 'all') ideasUi.set({ status: 'new' });
    if (id && assistant.enabled() && assistant.auto()) sortWithClaude(id).catch((e) => store.toast((e as Error).message));
  };

  return (
    <article className="page wide ideas-page">
      <header className="overview-head">
        <h1 className="title-input" style={{ fontStyle: 'normal' }}>
          Ideas
        </h1>
        <span className="muted ideas-count">{ideas.length ? `${counts.new} new, ${ideas.length} in all` : ''}</span>
      </header>

      <div className="ideas-capture">
        <textarea
          className="cap-text"
          rows={text.includes('\n') || text.length > 90 ? 4 : 2}
          value={text}
          aria-label="New idea"
          placeholder="Jot an idea: a character’s secret, a twist, a place, a line of dialogue…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
        />
        <div className="ideas-capture-foot">
          <LiveSort text={text} />
          <button className="btn primary" disabled={!text.trim()} onClick={save}>
            Save idea
          </button>
        </div>
      </div>

      <div className="ideas-toolbar">
        <div className="segmented" role="group" aria-label="Show">
          {(['new', 'kept', 'used', 'dropped', 'all'] as const).map((st) => (
            <button key={st} aria-pressed={ui.status === st} onClick={() => ideasUi.set({ status: st })}>
              {st === 'all' ? 'All' : IDEA_STATUS_LABEL[st]}
              {st !== 'all' && counts[st] > 0 && <span className="seg-count">{counts[st]}</span>}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Group by">
          {(
            [
              ['inbox', 'Newest first'],
              ['type', 'By kind'],
              ['about', 'By who & where'],
            ] as [IdeasView, string][]
          ).map(([v, l]) => (
            <button key={v} aria-pressed={ui.view === v} onClick={() => ideasUi.set({ view: v })}>
              {l}
            </button>
          ))}
        </div>
        <input className="input ideas-search" type="search" placeholder="Search ideas" aria-label="Search ideas" value={ui.query} onChange={(e) => ideasUi.set({ query: e.target.value })} />
        {ui.type && (
          <button className="chip" onClick={() => ideasUi.set({ type: null })}>
            {IDEA_TYPE_LABEL[ui.type]} <IconX width={12} height={12} />
          </button>
        )}
      </div>

      {ideas.length === 0 ? (
        <div className="empty-state ideas-empty">
          <IconIdea width={28} height={28} />
          <p>
            Ideas land here: a character’s secret, a twist, a place, a scene you can half see. Write them the way they come. Inkwell works out what each one is about and where it might fit. Press <kbd>Ctrl</kbd>+<kbd>J</kbd> from anywhere to jot one down.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted ideas-none">No ideas here. {ui.status === 'new' ? 'Everything new has been sorted.' : ''}</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="ideas-group">
            {g.title && (
              <h2 className="ideas-group-title">
                {'entity' in g && g.entity && docs[g.entity] ? <DocIcon d={docs[g.entity]} /> : 'type' in g && g.type ? (() => {
                  const I = TYPE_ICON[g.type as IdeaType];
                  return <I width={15} height={15} />;
                })() : null}
                {'entity' in g && g.entity ? (
                  <button className="link-btn" onClick={() => store.select(g.entity as string)}>
                    {g.title}
                  </button>
                ) : (
                  g.title
                )}
                <span className="muted">{g.items.length}</span>
              </h2>
            )}
            <div className="idea-grid">
              {g.items.map((i) => (
                <IdeaCard key={`${g.key}-${i.id}`} idea={i} />
              ))}
            </div>
          </section>
        ))
      )}
    </article>
  );
}

// ---------- one idea ----------

export function IdeaPage({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const rev = useStore((s) => s.externalRev);
  const linking = useEntityLinking();
  const ideas = useIdeas();
  const idea = ideaOf(doc);
  const links = ideaLinks(idea, docs);
  const index = useMemo(() => store.mentionIndex(), [docs, binder]);
  const fits = idea.target ? [] : suggestPlacements(idea, docs, binder, index, 3);
  const related = relatedIdeas(idea, ideas, docs);
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const claude = doc.fields.claude as { why?: string; questions?: string[] } | undefined;
  const set = (fields: Record<string, unknown>) => store.updateDoc(doc.id, { fields });
  const linkOptions: PickOption[] = [...characterOptions(docs), ...worldOptions(docs), ...subplotOptions(docs)].filter((o) => !links.includes(o.id));
  const appendable = links.filter((id) => ['character', 'world', 'subplot', 'event'].includes(kindOf(id) ?? ''));
  const ask = async () => {
    setAsking(true);
    setAiError(null);
    try {
      await sortWithClaude(doc.id);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };
  return (
    <article className="page entity-page idea-page">
      <nav className="crumbs">
        <button onClick={() => store.showOverview('ideas')}>Ideas</button>
      </nav>
      <div className="idea-head">
        <TypeTag type={idea.type} auto={idea.typeAuto} onPick={(t) => store.setIdeaType(doc.id, t)} />
        <div className="segmented" role="group" aria-label="Status">
          {IDEA_STATUSES.map((st) => (
            <button key={st} aria-pressed={idea.status === st} onClick={() => set({ status: st })}>
              {IDEA_STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      </div>
      <ProseEditor
        docId={doc.id}
        markdown={doc.body}
        rev={rev}
        onChange={(md, id) => store.editIdeaText(id, md)}
        placeholder="Write the idea the way it came to you. Type @ to link a character or place."
        className="no-indent idea-prose"
        {...linking}
      />

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>About</h2>
          <span className="hint">Found from names in the idea; add or remove any</span>
        </div>
        <div className="chips">
          {links.map((id) => (
            <LinkChip
              key={id}
              id={id}
              onRemove={() => (idea.links.includes(id) ? set({ links: idea.links.filter((x) => x !== id) }) : set({ unlinked: [...idea.unlinked, id] }))}
            />
          ))}
          <div style={{ width: 230 }}>
            <Picker compact label="Add who or what it’s about" placeholder="Add a character, place or subplot" value={null} options={linkOptions} onChange={(id) => id && set({ links: [...idea.links, id], unlinked: idea.unlinked.filter((x) => x !== id) })} />
          </div>
        </div>
      </section>

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Where it fits</h2>
        </div>
        {idea.target && docs[idea.target] ? (
          <div className="fit-row pinned">
            <IconPin width={15} height={15} />
            <button className="link-btn" onClick={() => store.select(idea.target!)}>
              {placeLabel(idea.target, docs, binder)}
            </button>
            <button className="btn ghost" onClick={() => set({ target: undefined })}>
              Unpin
            </button>
          </div>
        ) : fits.length ? (
          <ul className="fit-list">
            {fits.map((f) => (
              <li key={f.id}>
                <span>
                  <button className="link-btn" onClick={() => store.select(f.id)}>
                    {placeLabel(f.id, docs, binder)}
                  </button>
                  <small>{f.why}</small>
                </span>
                <button className="btn" onClick={() => set({ target: f.id })}>
                  <IconPin width={14} height={14} /> Pin here
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No scene stands out yet. Pin it to one yourself, or leave it loose.</p>
        )}
        <div style={{ width: 300, marginTop: 10 }}>
          <Picker compact label="Pin to a scene" placeholder="Pin to a scene…" value={null} options={sceneOptions(docs, binder)} onChange={(id) => id && set({ target: id })} />
        </div>
      </section>

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Use it</h2>
          <span className="hint">Creates it and marks the idea as used</span>
        </div>
        <div className="use-row">
          {useOptions(idea.type).map((as, i) => (
            <button key={as} className={`btn ${i === 0 ? 'primary' : ''}`} onClick={() => store.useIdea(doc.id, as)}>
              <IconPlus width={14} height={14} /> {USE_LABEL[as]}
            </button>
          ))}
          {appendable.map((id) => (
            <button key={id} className="btn ghost" onClick={() => store.addIdeaTo(doc.id, id)}>
              Add to {docs[id]?.title}’s notes
            </button>
          ))}
        </div>
      </section>

      {assistant.enabled() && (
        <section className="ent-section claude-panel">
          <div className="ent-section-head">
            <h2>
              <IconWand width={16} height={16} /> Claude’s read
            </h2>
            <button className="btn" onClick={ask} disabled={asking}>
              {asking ? 'Thinking…' : claude ? 'Ask again' : 'Ask Claude to sort this'}
            </button>
          </div>
          {aiError && <p className="form-error">{aiError}</p>}
          {claude?.why && <p>{claude.why}</p>}
          {!!claude?.questions?.length && (
            <>
              <p className="muted" style={{ margin: '10px 0 4px' }}>
                Questions to take it further
              </p>
              <ul className="claude-q">
                {claude.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <button className="btn ghost" onClick={() => store.updateDoc(doc.id, { body: `${doc.body.trimEnd()}\n\n${claude.questions!.map((q) => `- ${q}`).join('\n')}` }, { external: true })}>
                Add these questions to the idea
              </button>
            </>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="ent-section">
          <div className="ent-section-head">
            <h2>Related ideas</h2>
          </div>
          <ul className="related-ideas">
            {related.map((r) => {
              const o = ideas.find((x) => x.id === r.id)!;
              const I = TYPE_ICON[o.type];
              return (
                <li key={r.id}>
                  <button onClick={() => store.select(r.id)}>
                    <I width={14} height={14} className={`it-ic it-${o.type}`} />
                    <span>{o.title}</span>
                    <small className="muted">{IDEA_STATUS_LABEL[o.status]}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="danger-zone">
        <button className="btn ghost danger" onClick={() => confirmDelete(doc.id)}>
          <IconTrash width={14} height={14} /> Delete idea
        </button>
      </div>
    </article>
  );
}

// ---------- sidebar ----------

export function IdeasSidebar() {
  const ideas = useIdeas();
  const selected = useStore((s) => s.selectedId);
  const ui = useIdeasUi();
  const show = (patch: Partial<ReturnType<typeof ideasUi.get>>) => {
    ideasUi.set(patch);
    store.showOverview('ideas');
  };
  return (
    <>
      <div className="sidebar-tools">
        <button className={`side-link ${selected === null ? 'on' : ''}`} onClick={() => show({})}>
          Ideas
        </button>
        <button className="icon-btn" title="Jot down an idea (Ctrl+J)" aria-label="Jot down an idea" onClick={() => store.setCapture(true)}>
          <IconPlus />
        </button>
      </div>
      <div className="binder">
        {IDEA_STATUSES.map((st) => {
          const n = ideas.filter((i) => i.status === st).length;
          return (
            <div key={st} className={`brow entity ${selected === null && ui.status === st && !ui.type ? 'selected' : ''}`} style={{ paddingLeft: 10 }} onClick={() => show({ status: st, type: null })}>
              <span className={`ic-dot ${st}`} aria-hidden="true" />
              <span className="btitle">{IDEA_STATUS_LABEL[st]}</span>
              <span className="bcount">{n || ''}</span>
            </div>
          );
        })}
        <h3 className="side-group-title" style={{ marginTop: 14 }}>
          Kinds
        </h3>
        {IDEA_TYPES.map((t) => {
          const n = ideas.filter((i) => i.type === t && i.status !== 'dropped').length;
          if (!n) return null;
          const I = TYPE_ICON[t];
          return (
            <div key={t} className={`brow entity ${selected === null && ui.type === t ? 'selected' : ''}`} style={{ paddingLeft: 10 }} onClick={() => show({ type: t, status: 'all', view: 'inbox' })}>
              <I className={`kind it-ic it-${t}`} />
              <span className="btitle">{IDEA_TYPE_LABEL[t]}</span>
              <span className="bcount">{n}</span>
            </div>
          );
        })}
        {ideas.length === 0 && <div className="binder-empty">Press Ctrl+J anywhere to jot down an idea.</div>}
      </div>
    </>
  );
}

// ---------- ideas next to a character, place, subplot or scene ----------

export function IdeasFor({ id }: { id: string }) {
  const ideas = useIdeas();
  const docs = useStore((s) => s.project!.docs);
  const mine = ideas.filter((i) => i.status !== 'dropped' && (i.target === id || ideaLinks(i, docs).includes(id)));
  return (
    <section className="insp-section">
      <div className="insp-label">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconIdea width={13} height={13} /> Ideas
        </span>
        <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Jot an idea about this" title="Jot an idea about this" onClick={() => store.setCapture(true, id)}>
          <IconPlus />
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="muted insp-note">No ideas about this yet.</p>
      ) : (
        <ul className="ideas-for">
          {mine.slice(0, 8).map((i) => {
            const I = TYPE_ICON[i.type];
            return (
              <li key={i.id}>
                <button onClick={() => store.select(i.id)} className={i.status === 'used' ? 'used' : ''}>
                  <I width={13} height={13} className={`it-ic it-${i.type}`} />
                  <span>{i.title}</span>
                  {i.target === id && <IconPin width={11} height={11} className="muted" />}
                </button>
              </li>
            );
          })}
          {mine.length > 8 && <li className="muted insp-note">and {mine.length - 8} more</li>}
        </ul>
      )}
    </section>
  );
}

export type { ClaudeSort };
