import { useEffect, useMemo, useRef } from 'react';
import { daysOut, marketOf, storyOptions, storyWords, submissionOf, submissionStats, submissionWarnings, SUB_STATUSES, SUB_STATUS_LABEL, type Market, type Submission, type SubStatus, type SubWarning } from '../../model/submissions';
import type { Doc } from '../../model/types';
import { dayKey, store, useStore } from '../../store/store';
import { IconAccepted, IconExternal, IconMarket, IconPlus, IconSubmissions, IconTrash, IconWarn } from '../icons';
import { useEntityLinking } from '../linking';
import { AutoTextarea } from '../Page';
import { Picker, type PickOption } from '../pickers';
import { ProseEditor } from '../ProseEditor';
import { confirmDelete } from '../Binder';

// ---------- shared data ----------

function useSubmissionData() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const title = useStore((s) => s.project!.meta.title);
  const counts = useStore((s) => s.counts);
  return useMemo(() => {
    const subs = Object.values(docs)
      .filter((d) => d.kind === 'submission')
      .map(submissionOf)
      .sort((a, b) => (b.sent ?? '').localeCompare(a.sent ?? '') || a.id.localeCompare(b.id));
    const markets: Record<string, Market> = {};
    for (const d of Object.values(docs)) if (d.kind === 'market') markets[d.id] = marketOf(d);
    const stories = storyOptions(binder, docs, title);
    const words = (story: string | null) => storyWords(story, binder, counts);
    const storyTitle = (story: string | null) => stories.find((s) => s.id === story)?.title ?? title;
    return { docs, subs, markets, stories, words, storyTitle, today: dayKey() };
  }, [docs, binder, title, counts]);
}

const fmtDate = (k: string | null) => {
  if (!k) return '—';
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export function StatusPill({ status }: { status: SubStatus }) {
  return (
    <span className={`sub-pill ${status}`}>
      {status === 'accepted' && <IconAccepted width={12} height={12} />}
      {SUB_STATUS_LABEL[status]}
    </span>
  );
}

function warningText(w: SubWarning, market: Market | undefined, data: ReturnType<typeof useSubmissionData>) {
  const name = (id: string) => {
    const s = data.subs.find((x) => x.id === id);
    return s?.market ? data.markets[s.market]?.name ?? 'another market' : 'another market';
  };
  switch (w.kind) {
    case 'rejected-before':
      return `${market?.name ?? 'This market'} already turned this story down (${fmtDate(data.subs.find((s) => s.id === w.other)?.response ?? data.subs.find((s) => s.id === w.other)?.sent ?? null)}).`;
    case 'market-no-sims':
      return `${market?.name ?? 'This market'} doesn’t accept simultaneous submissions, and the story is also out with ${w.others.map(name).join(', ')}.`;
    case 'elsewhere-no-sims':
      return `${w.others.map(name).join(', ')} ${w.others.length === 1 ? 'doesn’t' : 'don’t'} accept simultaneous submissions, and the story is still out there.`;
    case 'too-long':
      return `The story is ${w.words.toLocaleString()} words; ${market?.name ?? 'this market'} takes up to ${w.max.toLocaleString()}.`;
    case 'too-short':
      return `The story is ${w.words.toLocaleString()} words; ${market?.name ?? 'this market'} wants at least ${w.min.toLocaleString()}.`;
    case 'overdue':
      return `Out ${w.days} days; they usually answer within ${w.expected}. A polite query may be in order.`;
  }
}

function marketOptions(markets: Record<string, Market>): PickOption[] {
  return Object.values(markets)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ id: m.id, title: m.name, sub: m.pay || undefined, icon: <IconMarket width={15} height={15} /> }));
}

// ---------- sidebar ----------

export function SubmissionsSidebar() {
  const data = useSubmissionData();
  const selected = useStore((s) => s.selectedId);
  const markets = Object.values(data.markets).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="sidebar-tools">
        <button className={`side-link ${selected === null ? 'on' : ''}`} onClick={() => store.showOverview('submissions')}>
          Submissions
        </button>
        <button className="icon-btn" title="New submission" aria-label="New submission" onClick={() => store.addSubmission()}>
          <IconPlus />
        </button>
      </div>
      <div className="binder">
        {data.subs.slice(0, 40).map((s) => (
          <div key={s.id} className={`brow entity ${selected === s.id ? 'selected' : ''}`} style={{ paddingLeft: 10 }} onClick={() => store.select(s.id)}>
            <span className={`sub-dot ${s.status}`} aria-hidden="true" />
            <span className="btitle">{s.market ? data.markets[s.market]?.name ?? 'Missing market' : 'Choose a market'}</span>
            <span className="bcount">{s.sent ? fmtDate(s.sent).replace(/,? \d{4}$/, '') : ''}</span>
          </div>
        ))}
        <div className="side-group-head">
          <h3 className="side-group-title">Markets</h3>
          <button className="icon-btn" title="New market" aria-label="New market" onClick={() => store.addMarket()}>
            <IconPlus />
          </button>
        </div>
        {markets.length === 0 && <div className="binder-empty">Magazines, anthologies and contests you send to. Keep their rules here once.</div>}
        {markets.map((m) => (
          <div key={m.id} className={`brow entity ${selected === m.id ? 'selected' : ''}`} style={{ paddingLeft: 10 }} onClick={() => store.select(m.id)}>
            <IconMarket className="kind" />
            <span className="btitle">{m.name}</span>
            <span className="bcount">{data.subs.filter((s) => s.market === m.id).length || ''}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- overview ----------

export function SubmissionsPage() {
  const data = useSubmissionData();
  const stats = submissionStats(data.subs);
  const multi = data.stories.length > 1;
  const groups = useMemo(() => {
    const out: { story: string | null; title: string; subs: Submission[] }[] = [];
    for (const s of data.subs) {
      let g = out.find((x) => x.story === s.story);
      if (!g) out.push((g = { story: s.story, title: data.storyTitle(s.story), subs: [] }));
      g.subs.push(s);
    }
    return out;
  }, [data]);

  return (
    <article className="page wide submissions-page">
      <header className="overview-head">
        <h1 className="title-input" style={{ fontStyle: 'normal' }}>
          Submissions
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => store.addMarket()}>
            <IconMarket width={15} height={15} /> New market
          </button>
          <button className="btn primary" onClick={() => store.addSubmission()}>
            <IconSubmissions width={15} height={15} /> Log a submission
          </button>
        </div>
      </header>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="st-label">Out now</span>
          <span className="st-value">{stats.out}</span>
          <span className="st-sub">{stats.out === 1 ? 'submission waiting' : 'submissions waiting'}</span>
        </div>
        <div className="stat-tile">
          <span className="st-label">Sent</span>
          <span className="st-value">{stats.total}</span>
          <span className="st-sub">in total</span>
        </div>
        <div className="stat-tile">
          <span className="st-label">Acceptance rate</span>
          <span className="st-value">{stats.acceptanceRate === null ? '—' : `${Math.round(stats.acceptanceRate * 100)}%`}</span>
          <span className="st-sub">{stats.decided ? `${stats.accepted} of ${stats.decided} answered` : 'No answers yet'}</span>
        </div>
        <div className="stat-tile">
          <span className="st-label">Average reply</span>
          <span className="st-value">{stats.avgResponseDays === null ? '—' : stats.avgResponseDays}</span>
          <span className="st-sub">{stats.avgResponseDays === null ? 'Log response dates to see this' : 'days from sending'}</span>
        </div>
      </div>

      {data.subs.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 28 }}>
          <p>Log every place you send this story: when it went, what came back, and what they paid. Inkwell warns you before you resubmit to a market that passed, break a no-simultaneous rule, or send something over a word limit.</p>
          <button className="btn primary" onClick={() => store.addSubmission()}>
            Log the first submission
          </button>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.story ?? 'all'} className="sub-group">
            {multi && <h2 className="chart-title">{g.title}</h2>}
            <div className="sub-table" role="table" aria-label={`Submissions of ${g.title}`}>
              <div className="sub-tr sub-th" role="row">
                <span role="columnheader">Market</span>
                <span role="columnheader">Sent</span>
                <span role="columnheader">Days out</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Reply</span>
                <span role="columnheader">Paid</span>
              </div>
              {g.subs.map((s) => {
                const m = s.market ? data.markets[s.market] : undefined;
                const warns = submissionWarnings(s, data.subs, data.markets, data.words(s.story), data.today);
                const d = daysOut(s, data.today);
                return (
                  <button key={s.id} className={`sub-tr ${s.status}`} role="row" onClick={() => store.select(s.id)}>
                    <span role="cell" className="sub-market">
                      {m ? m.name : <span className="muted">Choose a market</span>}
                      {warns.length > 0 && (
                        <span className="sub-warn" title={warns.map((w) => warningText(w, m, data)).join('\n')} aria-label={`${warns.length} warning${warns.length > 1 ? 's' : ''}`}>
                          <IconWarn width={13} height={13} />
                        </span>
                      )}
                    </span>
                    <span role="cell">{fmtDate(s.sent)}</span>
                    <span role="cell" className="num">
                      {d === null ? '—' : d}
                    </span>
                    <span role="cell">
                      <StatusPill status={s.status} />
                    </span>
                    <span role="cell">{s.status === 'pending' ? '' : fmtDate(s.response)}</span>
                    <span role="cell">{s.payment || ''}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </article>
  );
}

// ---------- one submission ----------

export function SubmissionPage({ doc }: { doc: Doc }) {
  const data = useSubmissionData();
  const rev = useStore((s) => s.externalRev);
  const linking = useEntityLinking();
  const s = submissionOf(doc);
  const m = s.market ? data.markets[s.market] : undefined;
  const warns = submissionWarnings(s, data.subs, data.markets, data.words(s.story), data.today);
  const set = (fields: Record<string, unknown>) => store.updateDoc(doc.id, { fields });
  const d = daysOut(s, data.today);
  return (
    <article className="page entity-page sub-page">
      <nav className="crumbs">
        <button onClick={() => store.showOverview('submissions')}>Submissions</button>
      </nav>
      <h1 className="title-input ent-title sub-title">
        {m ? m.name : 'New submission'}
        <small>
          {data.storyTitle(s.story)}
          {s.sent ? ` · sent ${fmtDate(s.sent)}` : ''}
          {d !== null ? ` · ${d} ${d === 1 ? 'day' : 'days'}${s.status === 'pending' ? ' so far' : ''}` : ''}
        </small>
      </h1>

      {warns.length > 0 && (
        <div className="sub-warnings" role="status">
          {warns.map((w, i) => (
            <p key={i}>
              <IconWarn width={15} height={15} /> {warningText(w, m, data)}
            </p>
          ))}
        </div>
      )}

      <div className="event-grid">
        <label className="ev-field">
          <span>Market</span>
          <Picker
            compact
            label="Market"
            placeholder="Choose or add a market"
            value={s.market}
            options={marketOptions(data.markets)}
            createLabel="Add market"
            onCreate={(name) => store.addMarket(name, { select: false })}
            onChange={(id) => store.updateDoc(doc.id, { title: id ? data.docs[id]?.title ?? store.get().project!.docs[id]?.title ?? doc.title : 'New submission', fields: { market: id ?? undefined } })}
          />
        </label>
        {data.stories.length > 1 ? (
          <label className="ev-field">
            <span>Story</span>
            <select className="input" aria-label="Story" value={s.story ?? ''} onChange={(e) => set({ story: e.target.value || undefined })}>
              {data.stories.map((o) => (
                <option key={o.id ?? ''} value={o.id ?? ''}>
                  {o.id ? o.title : `${o.title} (whole project)`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="ev-field">
            <span>Story</span>
            <span className="sub-static">
              {data.storyTitle(null)} · {data.words(null).toLocaleString()} words
            </span>
          </div>
        )}
        <label className="ev-field">
          <span>Sent</span>
          <input className="input" type="date" aria-label="Date sent" value={s.sent ?? ''} onChange={(e) => set({ sent: e.target.value || undefined })} />
        </label>
        <label className="ev-field">
          <span>Reply received</span>
          <input className="input" type="date" aria-label="Reply date" value={s.response ?? ''} disabled={s.status === 'pending'} onChange={(e) => set({ response: e.target.value || undefined })} />
        </label>
        <div className="ev-field sub-status-field">
          <span>Status</span>
          <div className="segmented" role="group" aria-label="Status">
            {SUB_STATUSES.map((st) => (
              <button
                key={st}
                aria-pressed={s.status === st}
                onClick={() => set({ status: st, response: st === 'pending' ? undefined : s.response ?? (st === 'no-reply' || st === 'withdrawn' ? undefined : data.today) })}
              >
                {SUB_STATUS_LABEL[st]}
              </button>
            ))}
          </div>
        </div>
        <label className="ev-field">
          <span>Payment</span>
          <input className="input" aria-label="Payment" value={s.payment} placeholder={s.status === 'accepted' ? 'e.g. $320 and two copies' : 'If accepted'} onChange={(e) => set({ payment: e.target.value })} />
        </label>
      </div>

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Notes</h2>
          <span className="hint">Editor’s comments, cover letter, rights sold</span>
        </div>
        <ProseEditor docId={doc.id} markdown={doc.body} rev={rev} onChange={(md, id) => store.updateDoc(id, { body: md })} placeholder="What did they say?" className="no-indent entity-prose" {...linking} />
      </section>
      <div className="danger-zone">
        <button className="btn ghost danger" onClick={() => confirmDelete(doc.id)}>
          <IconTrash width={14} height={14} /> Delete submission
        </button>
      </div>
    </article>
  );
}

// ---------- one market ----------

export function MarketPage({ doc }: { doc: Doc }) {
  const data = useSubmissionData();
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
  const m = marketOf(doc);
  const history = data.subs.filter((s) => s.market === doc.id);
  const set = (fields: Record<string, unknown>) => store.updateDoc(doc.id, { fields });
  const num = (v: string) => (v.trim() && /^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined);
  const url = m.url && /^https?:\/\//i.test(m.url) ? m.url : m.url ? `https://${m.url}` : '';
  const rename = (title: string) => {
    store.updateDoc(doc.id, { title });
    // Submissions show the market's name; keep their titles in step.
    for (const s of history) store.updateDoc(s.id, { title });
  };
  return (
    <article className="page entity-page sub-page">
      <nav className="crumbs">
        <button onClick={() => store.showOverview('submissions')}>Submissions</button>
        <span>Markets</span>
      </nav>
      <AutoTextarea ref={titleRef} className="title-input ent-title" value={doc.title} placeholder="Market name" aria-label="Market name" onChange={(e) => rename(e.target.value.replace(/\n/g, ' '))} />
      <div className="event-grid">
        <label className="ev-field">
          <span>Website</span>
          <span className="sub-url">
            <input className="input" aria-label="Website" value={m.url} placeholder="guidelines page" onChange={(e) => set({ url: e.target.value })} />
            {url && (
              <a className="icon-btn" href={url} target="_blank" rel="noreferrer" aria-label="Open website" title="Open website">
                <IconExternal />
              </a>
            )}
          </span>
        </label>
        <label className="ev-field">
          <span>Pay rate</span>
          <input className="input" aria-label="Pay rate" value={m.pay} placeholder="e.g. 8¢ a word, $50 flat" onChange={(e) => set({ pay: e.target.value })} />
        </label>
        <div className="ev-field">
          <span>Word limits</span>
          <span className="sub-range">
            <input className="input" inputMode="numeric" aria-label="Minimum words" placeholder="Min" value={m.minWords ?? ''} onChange={(e) => set({ minWords: num(e.target.value) })} />
            <span className="muted">to</span>
            <input className="input" inputMode="numeric" aria-label="Maximum words" placeholder="Max" value={m.maxWords ?? ''} onChange={(e) => set({ maxWords: num(e.target.value) })} />
          </span>
        </div>
        <label className="ev-field">
          <span>Usual reply time</span>
          <span className="sub-range">
            <input className="input" inputMode="numeric" aria-label="Usual reply time in days" placeholder="e.g. 60" value={m.responseDays ?? ''} onChange={(e) => set({ responseDays: num(e.target.value) })} />
            <span className="muted">days</span>
          </span>
        </label>
        <div className="ev-field">
          <span>Simultaneous submissions</span>
          <div className="segmented" role="group" aria-label="Simultaneous submissions">
            <button aria-pressed={m.simultaneous} onClick={() => set({ simultaneous: true })}>
              Accepted
            </button>
            <button aria-pressed={!m.simultaneous} onClick={() => set({ simultaneous: false })}>
              Not allowed
            </button>
          </div>
        </div>
      </div>

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>History</h2>
          <button className="btn ghost" onClick={() => store.addSubmission({ market: doc.id })}>
            <IconSubmissions width={14} height={14} /> Submit here
          </button>
        </div>
        {history.length === 0 ? (
          <p className="muted">Nothing sent here yet.</p>
        ) : (
          <ul className="sub-history">
            {history.map((s) => (
              <li key={s.id}>
                <button onClick={() => store.select(s.id)}>
                  <span>{data.storyTitle(s.story)}</span>
                  <span className="muted">{fmtDate(s.sent)}</span>
                  <StatusPill status={s.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ent-section">
        <div className="ent-section-head">
          <h2>Notes</h2>
          <span className="hint">Guidelines, editors’ names, what they like</span>
        </div>
        <ProseEditor docId={doc.id} markdown={doc.body} rev={rev} onChange={(md, id) => store.updateDoc(id, { body: md })} placeholder="What do they publish? Who reads the slush?" className="no-indent entity-prose" {...linking} />
      </section>
      <div className="danger-zone">
        <button className="btn ghost danger" onClick={() => confirmDelete(doc.id)}>
          <IconTrash width={14} height={14} /> Delete market
        </button>
      </div>
    </article>
  );
}
