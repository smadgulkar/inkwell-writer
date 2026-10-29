import { useEffect, useMemo, useRef, useState } from 'react';
import { calendarOf, dayNumber, displayStoryDate, GREGORIAN, type Calendar, type CalendarMonth } from '../../model/calendar';
import { parentOf } from '../../model/binder';
import { buildTimeline, eventEntities, eventScopeOf, type TimelineItem } from '../../model/timeline';
import type { Doc } from '../../model/types';
import { store, useStore } from '../../store/store';
import { IconCalendar, IconDown, IconPlus, IconScene, IconUp, IconX, WORLD_ICON } from '../icons';
import { useEntityLinking } from '../linking';
import { AutoTextarea } from '../Page';
import { Avatar, characterOptions, Picker, sceneOptions, worldOptions } from '../pickers';
import { ProseEditor } from '../ProseEditor';
import { worldKindOf } from '../../model/entities';
import { DateFields, useCalendar } from './TimelineParts';

type Filter = 'all' | 'world' | 'story';

/** The date without its year (the year is the group heading). */
function withinYear(it: TimelineItem, cal: Calendar) {
  const { month, day } = it.date;
  if (!month) return 'During the year';
  const name = cal.months[month - 1]?.name ?? `Month ${month}`;
  return day ? `${day} ${name}` : name;
}

function EntityChip({ id }: { id: string }) {
  const d = useStore((s) => s.project!.docs[id]);
  if (!d) return null;
  const Icon = d.kind === 'world' ? WORLD_ICON[worldKindOf(d)] : null;
  return (
    <button
      className="chip"
      onClick={(e) => {
        e.stopPropagation();
        store.select(id);
      }}
    >
      {d.kind === 'character' ? <Avatar id={id} name={d.title} size={18} /> : Icon ? <Icon width={13} height={13} /> : null}
      {d.title}
    </button>
  );
}

/** A to-scale strip of the whole timeline; each item is a tick you can jump to. */
function Ruler({ items, cal, onJump }: { items: TimelineItem[]; cal: Calendar; onJump(id: string): void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ item: TimelineItem; x: number } | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (items.length < 2) return null;
  const pad = 18;
  const nums = items.map((i) => dayNumber(i.date, cal));
  const ends = items.map((i, k) => (i.end ? dayNumber(i.end, cal) : nums[k]));
  const lo = Math.min(...nums);
  const hi = Math.max(...ends);
  const span = Math.max(1, hi - lo);
  const X = (n: number) => pad + ((n - lo) / span) * (width - pad * 2);
  // Year ticks at a clean step.
  const yearLen = cal.months.reduce((a, m) => a + m.days, 0);
  const y0 = items[0].date.year;
  const y1 = Math.max(...items.map((i) => (i.end ?? i.date).year));
  const yspan = Math.max(1, y1 - y0);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2500, 5000].find((s) => yspan / s <= Math.max(3, Math.floor(width / 110))) ?? 10000;
  const ticks: number[] = [];
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) ticks.push(y);
  if (!ticks.length) ticks.push(y0);
  return (
    <div className="ruler" ref={wrap}>
      <svg width={width} height={64} role="img" aria-label={`Timeline from ${displayStoryDate(items[0].date, cal)} to ${displayStoryDate(items[items.length - 1].end ?? items[items.length - 1].date, cal)}`}>
        <line x1={pad} x2={width - pad} y1={34} y2={34} className="ruler-axis" />
        {ticks.map((y) => {
          const x = X(y * yearLen);
          if (x < pad - 1 || x > width - pad + 1) return null;
          return (
            <g key={y}>
              <line x1={x} x2={x} y1={30} y2={38} className="ruler-tick" />
              <text x={x} y={56} textAnchor="middle" className="ruler-label">
                {y}
                {cal.era ? ` ${cal.era}` : ''}
              </text>
            </g>
          );
        })}
        {items.map((it, k) => {
          const x = X(nums[k]);
          const cls = it.kind === 'scene' ? 'scene' : it.scope;
          return (
            <g
              key={it.id}
              className={`ruler-item ${cls}`}
              onMouseEnter={() => setHover({ item: it, x })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onJump(it.id)}
              role="button"
              aria-label={`${it.title}, ${displayStoryDate(it.date, cal)}`}
            >
              {it.end && <rect className="span" x={x} y={it.kind === 'scene' ? 30 : it.scope === 'world' ? 14 : 22} width={Math.max(2, X(ends[k]) - x)} height={4} rx={2} />}
              {it.kind === 'scene' ? (
                <rect x={x - 1.5} y={27} width={3} height={14} rx={1.5} className="mark" />
              ) : (
                <circle cx={x} cy={it.scope === 'world' ? 16 : 24} r={5} className="mark" />
              )}
              <rect className="hit" x={x - 9} y={4} width={18} height={40} />
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(hover.x, 90), width - 90) }}>
          <strong>{hover.item.title}</strong>
          <span>{displayStoryDate(hover.item.date, cal)}</span>
        </div>
      )}
      <div className="ruler-legend" aria-hidden="true">
        <span>
          <i className="lg world" /> World history
        </span>
        <span>
          <i className="lg story" /> Story events
        </span>
        <span>
          <i className="lg scene" /> Scenes
        </span>
      </div>
    </div>
  );
}

export function TimelinePage() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const cal = useCalendar();
  const [filter, setFilter] = useState<Filter>('all');
  const [who, setWho] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const index = useMemo(() => store.mentionIndex(), [docs, binder]); // eslint-disable-line react-hooks/exhaustive-deps
  const { items, undated } = useMemo(() => buildTimeline(docs, binder, cal, index), [docs, binder, cal, index]);
  const shown = items.filter((i) => (filter === 'all' || (filter === 'world' ? i.scope === 'world' : i.scope === 'story')) && (!who || i.entities.includes(who)));
  const listRef = useRef<HTMLOListElement>(null);
  const jump = (id: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-item="${id}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.classList.add('flash');
    setTimeout(() => el?.classList.remove('flash'), 1200);
  };

  // Group consecutive items by year.
  const groups: { year: number; items: TimelineItem[] }[] = [];
  for (const it of shown) {
    const g = groups[groups.length - 1];
    if (g && g.year === it.date.year) g.items.push(it);
    else groups.push({ year: it.date.year, items: [it] });
  }

  return (
    <article className="page wide timeline-page">
      <header className="overview-head">
        <h1 className="title-input" style={{ fontStyle: 'normal' }}>
          Timeline
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setCalendarOpen(true)}>
            <IconCalendar width={15} height={15} /> {cal.name === 'Standard' ? 'Calendar' : cal.name}
          </button>
          <button className="btn primary" onClick={() => store.addEvent(filter === 'story' ? 'story' : 'world')}>
            <IconPlus /> New event
          </button>
        </div>
      </header>

      <div className="tl-filters">
        <div className="segmented" role="group" aria-label="Show">
          {(
            [
              ['all', 'Everything'],
              ['world', 'World history'],
              ['story', 'The story'],
            ] as [Filter, string][]
          ).map(([f, l]) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ width: 240 }}>
          <Picker compact label="Character" placeholder="Everyone" value={who} options={characterOptions(docs)} clearable onChange={setWho} />
        </div>
      </div>

      {items.length === 0 && undated.length === 0 ? (
        <div className="empty-state">
          <p>Lay out your world’s history and your story’s chronology on one line. Add events, or give scenes a date in their inspector.</p>
          <button className="btn primary" onClick={() => store.addEvent('world')}>
            Add the first event
          </button>
        </div>
      ) : (
        <>
          <Ruler items={shown} cal={cal} onJump={jump} />
          <ol className="tl" ref={listRef}>
            {groups.map((g) => (
              <li key={`${g.year}-${g.items[0].id}`} className="tl-year">
                <div className="tl-year-label">
                  {g.year < 0 && !cal.era ? `${-g.year} BCE` : g.year}
                  {cal.era && <small>{cal.era}</small>}
                </div>
                <ol className="tl-items">
                  {g.items.map((it) => {
                    const sceneParent = it.kind === 'scene' ? parentOf(binder, it.id) : null;
                    return (
                      <li key={it.id} data-item={it.id} className={`tl-item ${it.kind} ${it.scope}`}>
                        <span className="tl-dot" aria-hidden="true" />
                        <button className="tl-card" onClick={() => store.select(it.id)}>
                          <span className="tl-date">
                            {withinYear(it, cal)}
                            {it.end && ` – ${displayStoryDate(it.end, cal)}`}
                          </span>
                          <span className="tl-title">
                            {it.kind === 'scene' && <IconScene width={14} height={14} />}
                            {it.title}
                          </span>
                          {it.kind === 'scene' && sceneParent && <span className="tl-sub">Scene in {docs[sceneParent.id]?.title}</span>}
                          {it.kind === 'event' && docs[it.id]?.body && <span className="tl-sub">{docs[it.id].body.split('\n')[0].replace(/[*_[\]]|\(ink:[a-z0-9_]+\)/g, '').slice(0, 160)}</span>}
                          {it.entities.length > 0 && (
                            <span className="chips">
                              {it.entities.slice(0, 6).map((e) => (
                                <EntityChip key={e} id={e} />
                              ))}
                              {it.entities.length > 6 && <span className="muted">+{it.entities.length - 6}</span>}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
          {shown.length === 0 && <p className="muted">Nothing matches this filter.</p>}
          {undated.length > 0 && (
            <section className="tl-undated">
              <h2 className="section-label">Not dated yet</h2>
              <div className="chips">
                {undated.map((d) => (
                  <button key={d.id} className="chip" onClick={() => store.select(d.id)}>
                    {d.title || 'Untitled event'}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {calendarOpen && <CalendarDialog onClose={() => setCalendarOpen(false)} />}
    </article>
  );
}

// ---------- event page ----------

export function EventPage({ doc }: { doc: Doc }) {
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
  const ents = eventEntities(doc);
  const scope = eventScopeOf(doc);
  const options = [...characterOptions(docs), ...worldOptions(docs)].filter((o) => !ents.includes(o.id));
  return (
    <article className="page entity-page">
      <nav className="crumbs">
        <button onClick={() => store.showOverview('timeline')}>Timeline</button>
      </nav>
      <AutoTextarea
        ref={titleRef}
        className="title-input ent-title"
        value={doc.title}
        placeholder="What happened?"
        aria-label="Event"
        onChange={(e) => store.updateDoc(doc.id, { title: e.target.value.replace(/\n/g, ' ') })}
      />
      <div className="event-grid">
        <label className="ev-field">
          <span>When</span>
          <DateFields label="Date" value={doc.fields.date} onChange={(v) => store.updateDoc(doc.id, { fields: { date: v } })} />
        </label>
        <label className="ev-field">
          <span>Until (optional)</span>
          <DateFields label="End date" value={doc.fields.end} onChange={(v) => store.updateDoc(doc.id, { fields: { end: v } })} />
        </label>
        <div className="ev-field">
          <span>Belongs to</span>
          <div className="segmented" role="group" aria-label="Belongs to">
            <button aria-pressed={scope === 'world'} onClick={() => store.updateDoc(doc.id, { fields: { scope: 'world' } })}>
              World history
            </button>
            <button aria-pressed={scope === 'story'} onClick={() => store.updateDoc(doc.id, { fields: { scope: 'story' } })}>
              The story
            </button>
          </div>
        </div>
        <label className="ev-field">
          <span>Shown in scene</span>
          <Picker
            compact
            label="Scene"
            placeholder="Not shown on the page"
            value={typeof doc.fields.scene === 'string' ? doc.fields.scene : null}
            options={sceneOptions(docs, binder)}
            clearable
            onChange={(id) => store.updateDoc(doc.id, { fields: { scene: id ?? undefined } })}
          />
        </label>
      </div>
      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Involved</h2>
        </div>
        <div className="chips">
          {ents
            .filter((e) => docs[e])
            .map((e) => (
              <span key={e} className="chip">
                <EntityChip id={e} />
                <button className="chip-x" aria-label={`Remove ${docs[e].title}`} onClick={() => store.updateDoc(doc.id, { fields: { entities: ents.filter((x) => x !== e) } })}>
                  <IconX />
                </button>
              </span>
            ))}
          <div style={{ width: 240 }}>
            <Picker
              compact
              label="Add who or what was involved"
              placeholder="Add a character or place"
              value={null}
              options={options}
              onChange={(id) => id && store.updateDoc(doc.id, { fields: { entities: [...ents, id] } })}
            />
          </div>
        </div>
      </section>
      <section className="ent-section">
        <div className="ent-section-head">
          <h2>What happened</h2>
          <span className="hint">Type @ to link a character or place</span>
        </div>
        <ProseEditor
          docId={doc.id}
          markdown={doc.body}
          rev={rev}
          onChange={(md, id) => store.updateDoc(id, { body: md })}
          placeholder="Causes, consequences, who remembers it and how…"
          className="no-indent entity-prose"
          {...linking}
        />
      </section>
    </article>
  );
}

// ---------- calendar ----------

function CalendarDialog({ onClose }: { onClose(): void }) {
  const meta = useStore((s) => s.project!.meta);
  const cal = calendarOf(meta);
  const [name, setName] = useState(cal.name);
  const [era, setEra] = useState(cal.era);
  const [months, setMonths] = useState<CalendarMonth[]>(cal.months);
  const save = () => {
    const clean = months.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), days: Math.max(1, Math.min(400, Math.round(m.days) || 30)) }));
    store.updateMeta({ calendar: { name: name.trim() || 'Custom', era: era.trim(), months: clean.length ? clean : GREGORIAN.months } });
    onClose();
  };
  const yearLen = months.reduce((a, m) => a + (Number(m.days) || 0), 0);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog calendar-dialog" role="dialog" aria-label="Calendar" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Your calendar</h2>
        <p>Name the months and set their lengths. Dates already in the project keep their numbers.</p>
        <div className="cal-top">
          <label className="ev-field">
            <span>Calendar name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Age of Tides" />
          </label>
          <label className="ev-field">
            <span>Era after the year</span>
            <input className="input" value={era} onChange={(e) => setEra(e.target.value)} placeholder="e.g. AT" />
          </label>
        </div>
        <ol className="cal-months">
          {months.map((m, i) => (
            <li key={i}>
              <span className="cal-n">{i + 1}</span>
              <input className="input" value={m.name} aria-label={`Month ${i + 1} name`} onChange={(e) => setMonths(months.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input
                className="input cal-days"
                type="number"
                min={1}
                max={400}
                value={m.days}
                aria-label={`Days in ${m.name}`}
                onChange={(e) => setMonths(months.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) } : x)))}
              />
              <span className="cal-moves">
                <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => setMonths(swap(months, i, i - 1))}>
                  <IconUp />
                </button>
                <button className="icon-btn" aria-label="Move down" disabled={i === months.length - 1} onClick={() => setMonths(swap(months, i, i + 1))}>
                  <IconDown />
                </button>
                <button className="icon-btn" aria-label={`Remove ${m.name}`} disabled={months.length === 1} onClick={() => setMonths(months.filter((_, j) => j !== i))}>
                  <IconX />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="cal-foot">
          <button className="add-link" onClick={() => setMonths([...months, { name: `Month ${months.length + 1}`, days: 30 }])}>
            <IconPlus /> Add month
          </button>
          <span className="muted">{yearLen} days a year</span>
          <button
            className="add-link"
            onClick={() => {
              setName('Standard');
              setEra('');
              setMonths(GREGORIAN.months);
            }}
          >
            Reset to the standard calendar
          </button>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save calendar
          </button>
        </div>
      </div>
    </>
  );
}

function swap<T>(arr: T[], a: number, b: number) {
  const out = [...arr];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

