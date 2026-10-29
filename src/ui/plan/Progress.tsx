import { useEffect, useRef, useState } from 'react';
import { sceneGroups } from '../../model/subplots';
import { STATUSES, type Status } from '../../model/types';
import { dayKey, store, useStore } from '../../store/store';
import { IconStreak } from '../icons';

interface Bar {
  key: string;
  label: string;
  value: number;
  tip: string;
  highlight?: boolean;
  onClick?: () => void;
}

const compact = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}K` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n));

function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Single-series column chart: thin columns, rounded data ends, one hairline grid, hover tooltip. */
function ColumnChart({ bars, height = 200, reference, label, everyNthLabel = 1 }: { bars: Bar[]; height?: number; reference?: { value: number; label: string }; label: string; everyNthLabel?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 24));
    ro.observe(el);
    setWidth(el.clientWidth - 24);
    return () => ro.disconnect();
  }, []);
  const left = 40;
  const right = 8;
  const top = 12;
  const bottom = 26;
  const ih = height - top - bottom;
  const iw = Math.max(10, width - left - right);
  const min = Math.min(0, ...bars.map((b) => b.value));
  const max = niceMax(Math.max(reference?.value ?? 0, ...bars.map((b) => b.value)));
  const Y = (v: number) => top + ih - ((v - min) / (max - min)) * ih;
  const slot = iw / Math.max(1, bars.length);
  const bw = Math.min(24, Math.max(3, slot - 2));
  const ticks = [0, max / 2, max];
  return (
    <div className="chart" ref={wrap}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={left - 8} y={Y(t) + 4} textAnchor="end" className="axis-label">
              {compact(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = left + i * slot + (slot - bw) / 2;
          const y0 = Y(0);
          const y1 = Y(b.value);
          const h = Math.abs(y0 - y1);
          const up = b.value >= 0;
          const r = Math.min(4, bw / 2, h);
          // Rounded at the data end, square at the baseline.
          const d = up
            ? `M${x} ${y0} V${y1 + r} Q${x} ${y1} ${x + r} ${y1} H${x + bw - r} Q${x + bw} ${y1} ${x + bw} ${y1 + r} V${y0} Z`
            : `M${x} ${y0} V${y1 - r} Q${x} ${y1} ${x + r} ${y1} H${x + bw - r} Q${x + bw} ${y1} ${x + bw} ${y1 - r} V${y0} Z`;
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={b.onClick} style={{ cursor: b.onClick ? 'pointer' : undefined }}>
              <rect x={left + i * slot} y={top} width={slot} height={ih} fill="transparent" />
              {h > 0.5 && <path d={d} className={`col ${b.highlight ? 'hl' : ''} ${hover === i ? 'hover' : ''} ${up ? '' : 'neg'}`} />}
              {i % everyNthLabel === 0 && (
                <text x={left + i * slot + slot / 2} y={height - 8} textAnchor="middle" className="axis-label">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
        <line x1={left} x2={width - right} y1={Y(0)} y2={Y(0)} className="baseline" />
        {reference && reference.value > 0 && (
          <g>
            <line x1={left} x2={width - right} y1={Y(reference.value)} y2={Y(reference.value)} className="ref" />
            <text x={width - right} y={Y(reference.value) - 6} textAnchor="end" className="ref-label">
              {reference.label}
            </text>
          </g>
        )}
      </svg>
      {hover !== null && bars[hover] && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(left + hover * slot + slot / 2, 80), width - 80), top: Math.max(0, Y(Math.max(0, bars[hover].value)) - 52) }}>
          {bars[hover].tip}
        </div>
      )}
    </div>
  );
}

function daysBetween(a: Date, b: Date) {
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000);
}

export function Progress() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const goals = useStore((s) => s.project!.meta.goals);
  const counts = useStore((s) => s.counts);
  const stats = useStore((s) => s.stats);
  const todayStart = useStore((s) => s.todayStart);
  const sessionStart = useStore((s) => s.sessionStart);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const today = Math.max(0, total - todayStart);
  const session = total - sessionStart;
  const daily = goals?.daily ?? 0;
  const goal = goals?.project ?? 0;

  // Last 30 days, oldest first.
  const days: { key: string; date: Date; words: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d);
    const rec = stats.days[k];
    days.push({ key: k, date: d, words: k === dayKey() ? total - todayStart : rec ? rec.end - rec.start : 0 });
  }
  // Streak: consecutive days, ending today or yesterday, that met the daily goal (or had any writing).
  const met = (w: number) => (daily ? w >= daily : w > 0);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (met(days[i].words)) streak++;
    else if (i === days.length - 1) continue;
    else break;
  }
  const last7 = days.slice(-7).reduce((a, d) => a + Math.max(0, d.words), 0);

  const deadline = goals?.deadline ? new Date(`${goals.deadline}T00:00:00`) : null;
  const left = Math.max(0, goal - total);
  const daysLeft = deadline && !isNaN(+deadline) ? daysBetween(now, deadline) : null;
  const perDay = daysLeft !== null && daysLeft > 0 ? Math.ceil(left / daysLeft) : null;

  const chapters = sceneGroups(binder, docs).filter((g) => g.scenes.length);
  const chapterWords = chapters.map((g) => g.scenes.reduce((a, s) => a + (counts[s] ?? 0), 0));
  const avg = chapterWords.length ? Math.round(chapterWords.reduce((a, b) => a + b, 0) / chapterWords.length) : 0;
  const allScenes = chapters.flatMap((g) => g.scenes);
  const byStatus = STATUSES.map((st) => ({ st, n: allScenes.filter((s) => ((docs[s]?.fields.status as Status) ?? 'draft') === st).length }));

  const setGoals = (patch: Record<string, number | string | undefined>) => store.updateMeta({ goals: { ...goals, ...patch } });

  return (
    <div className="progress">
      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="st-label">Manuscript</span>
          <span className="st-value">{total.toLocaleString()}</span>
          <span className="st-sub">{goal ? `${Math.round((total / goal) * 100)}% of ${goal.toLocaleString()}` : 'words'}</span>
          {goal > 0 && (
            <span className="meter" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} />
            </span>
          )}
        </div>
        <div className="stat-tile">
          <span className="st-label">Today</span>
          <span className="st-value">{today.toLocaleString()}</span>
          <span className="st-sub">{daily ? (today >= daily ? 'Daily goal reached' : `${(daily - today).toLocaleString()} to go`) : `${session.toLocaleString()} this session`}</span>
          {daily > 0 && (
            <span className="meter" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (today / daily) * 100)}%`, background: 'var(--st-final)' }} />
            </span>
          )}
        </div>
        <div className="stat-tile">
          <span className="st-label">Streak</span>
          <span className="st-value">
            {streak}
            {streak > 0 && <IconStreak className="streak-icon" aria-hidden="true" />}
          </span>
          <span className="st-sub">{streak === 1 ? 'day' : 'days'} {daily ? 'meeting your goal' : 'writing'} in a row</span>
        </div>
        <div className="stat-tile">
          <span className="st-label">Pace</span>
          {perDay !== null ? (
            <>
              <span className="st-value">{perDay.toLocaleString()}</span>
              <span className="st-sub">
                words a day to finish by {deadline!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </>
          ) : (
            <>
              <span className="st-value">{Math.round(last7 / 7).toLocaleString()}</span>
              <span className="st-sub">words a day over the last week</span>
            </>
          )}
        </div>
      </div>

      <section className="chart-section">
        <h2 className="chart-title">Words written, last 30 days</h2>
        {days.every((d) => !d.words) && <p className="muted chart-note">Each day you write, a column appears here. Inkwell counts words added across the whole project.</p>}
        <ColumnChart
          label="Words written per day over the last 30 days"
          bars={days.map((d, i) => ({
            key: d.key,
            label: i % 5 === 4 || i === 29 ? d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
            value: d.words,
            highlight: i === 29,
            tip: `${d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.words.toLocaleString()} words`,
          }))}
          reference={daily ? { value: daily, label: `Daily goal ${daily.toLocaleString()}` } : undefined}
        />
      </section>

      {chapters.length > 1 && (
        <section className="chart-section">
          <h2 className="chart-title">Chapter lengths</h2>
          <ColumnChart
            label="Words per chapter"
            bars={chapters.map((g, i) => ({
              key: g.id ?? String(i),
              label: String(i + 1),
              value: chapterWords[i],
              tip: `${g.title}: ${chapterWords[i].toLocaleString()} words, ${g.scenes.length} ${g.scenes.length === 1 ? 'scene' : 'scenes'}`,
              onClick: g.id ? () => store.select(g.id!) : undefined,
            }))}
            reference={avg ? { value: avg, label: `Average ${avg.toLocaleString()}` } : undefined}
            height={180}
          />
        </section>
      )}

      {allScenes.length > 0 && (
        <section className="chart-section">
          <h2 className="chart-title">Scenes by status</h2>
          <div className="status-bar" role="img" aria-label={byStatus.map((b) => `${b.n} ${b.st}`).join(', ')}>
            {byStatus.map((b) => (b.n ? <i key={b.st} style={{ flex: b.n, background: `var(--st-${b.st})` }} title={`${b.n} ${b.st}`} /> : null))}
          </div>
          <div className="status-legend">
            {byStatus.map((b) => (
              <span key={b.st}>
                <span className={`status-dot ${b.st}`} /> {b.st} <strong>{b.n}</strong>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="chart-section goals-form">
        <h2 className="chart-title">Goals</h2>
        <div className="goal-fields">
          <label className="ev-field">
            <span>Manuscript goal (words)</span>
            <input className="input" type="number" min={0} step={1000} value={goal || ''} placeholder="e.g. 90000" onChange={(e) => setGoals({ project: Number(e.target.value) || undefined })} />
          </label>
          <label className="ev-field">
            <span>Daily goal (words)</span>
            <input className="input" type="number" min={0} step={100} value={daily || ''} placeholder="e.g. 1000" onChange={(e) => setGoals({ daily: Number(e.target.value) || undefined })} />
          </label>
          <label className="ev-field">
            <span>Deadline</span>
            <input className="input" type="date" value={goals?.deadline ?? ''} onChange={(e) => setGoals({ deadline: e.target.value || undefined })} />
          </label>
        </div>
      </section>
    </div>
  );
}
