import { calendarOf, displayStoryDate, parseStoryDate, type Calendar } from '../../model/calendar';
import type { Doc } from '../../model/types';
import { store, useStore } from '../../store/store';
import { IconCalendar } from '../icons';

export function useCalendar(): Calendar {
  const meta = useStore((s) => s.project?.meta);
  return calendarOf(meta ?? {});
}

/** Year, optional month (by name) and optional day, written as "year-month-day". */
export function DateFields({ value, onChange, label, allowEmpty = true }: { value: unknown; onChange(v: string | undefined): void; label: string; allowEmpty?: boolean }) {
  const cal = useCalendar();
  const d = parseStoryDate(value, cal);
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const set = (year: string, month?: number, day?: number) => {
    if (!year.trim() || year === '-') return onChange(allowEmpty ? undefined : year);
    const parts = [year.trim()];
    if (month) parts.push(String(month));
    if (month && day) parts.push(String(day));
    onChange(parts.join('-'));
  };
  const year = d ? String(d.year) : raw.split('-').filter(Boolean)[0] ?? '';
  const days = d?.month ? cal.months[d.month - 1].days : 0;
  return (
    <div className="date-fields" role="group" aria-label={label}>
      <input
        className="input df-year"
        inputMode="numeric"
        value={year}
        placeholder="Year"
        aria-label={`${label}: year`}
        onChange={(e) => set(e.target.value.replace(/[^\d-]/g, ''), d?.month, d?.day)}
      />
      <select className="input df-month" value={d?.month ?? ''} aria-label={`${label}: month`} disabled={!d} onChange={(e) => set(year, e.target.value ? Number(e.target.value) : undefined, d?.day)}>
        <option value="">Any month</option>
        {cal.months.map((m, i) => (
          <option key={i} value={i + 1}>
            {m.name}
          </option>
        ))}
      </select>
      <select className="input df-day" value={d?.day ?? ''} aria-label={`${label}: day`} disabled={!d?.month} onChange={(e) => set(year, d?.month, e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">Day</option>
        {Array.from({ length: days }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StoryDateField({ doc }: { doc: Doc }) {
  const cal = useCalendar();
  const d = parseStoryDate(doc.fields.storyDate, cal);
  return (
    <section className="insp-section">
      <div className="insp-label">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconCalendar width={13} height={13} /> When it happens
        </span>
        {d && <span className="hint">{displayStoryDate(d, cal)}</span>}
      </div>
      <DateFields label="Story date" value={doc.fields.storyDate} onChange={(v) => store.updateDoc(doc.id, { fields: { storyDate: v } })} />
      {!d && <p className="muted insp-note" style={{ marginTop: 6 }}>Give the scene a date to place it on the timeline.</p>}
    </section>
  );
}
