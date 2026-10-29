// Story calendars. A date is written "year-month-day" with numbers ("412-3-14"), and any of
// month or day may be left off ("412", "412-3"). Years may be negative. The calendar gives
// months their names and lengths, and an era label shown after the year ("412 AT").

export interface CalendarMonth {
  name: string;
  days: number;
}

export interface Calendar {
  name: string;
  era: string;
  months: CalendarMonth[];
}

export const GREGORIAN: Calendar = {
  name: 'Standard',
  era: '',
  months: [
    ['January', 31],
    ['February', 28],
    ['March', 31],
    ['April', 30],
    ['May', 31],
    ['June', 30],
    ['July', 31],
    ['August', 31],
    ['September', 30],
    ['October', 31],
    ['November', 30],
    ['December', 31],
  ].map(([name, days]) => ({ name: name as string, days: days as number })),
};

export function calendarOf(meta: { calendar?: unknown }): Calendar {
  const c = meta.calendar as Partial<Calendar> | undefined;
  if (!c || typeof c !== 'object') return GREGORIAN;
  const months = Array.isArray(c.months)
    ? c.months
        .filter((m) => m && typeof m === 'object' && typeof (m as CalendarMonth).name === 'string')
        .map((m) => ({ name: (m as CalendarMonth).name, days: Math.max(1, Math.min(400, Math.round(Number((m as CalendarMonth).days) || 30))) }))
    : [];
  return { name: typeof c.name === 'string' ? c.name : 'Custom', era: typeof c.era === 'string' ? c.era : '', months: months.length ? months : GREGORIAN.months };
}

export interface StoryDate {
  year: number;
  month?: number; // 1-based
  day?: number;
}

const DATE_RE = /^\s*(-?\d{1,7})(?:\s*[-/.]\s*(\d{1,3}))?(?:\s*[-/.]\s*(\d{1,3}))?\s*$/;

export function parseStoryDate(input: unknown, cal: Calendar = GREGORIAN): StoryDate | null {
  if (typeof input === 'number' && Number.isInteger(input)) return { year: input };
  if (typeof input !== 'string') return null;
  const m = DATE_RE.exec(input);
  if (!m) return null;
  const year = Number(m[1]);
  const d: StoryDate = { year };
  if (m[2] !== undefined) {
    const month = Number(m[2]);
    if (month < 1 || month > cal.months.length) return null;
    d.month = month;
    if (m[3] !== undefined) {
      const day = Number(m[3]);
      if (day < 1 || day > cal.months[month - 1].days) return null;
      d.day = day;
    }
  }
  return d;
}

export function formatStoryDateValue(d: StoryDate) {
  return [d.year, d.month, d.day].filter((x) => x !== undefined).join('-');
}

/** A sortable number. Partial dates sort before full dates in the same period. */
export function dateKey(d: StoryDate): number {
  return d.year * 1_000_000 + (d.month ?? 0) * 1000 + (d.day ?? 0);
}

/** Days from year 0, used to place dates on a scale. */
export function dayNumber(d: StoryDate, cal: Calendar): number {
  const yearLen = cal.months.reduce((a, m) => a + m.days, 0);
  let n = d.year * yearLen;
  for (let i = 0; i < (d.month ?? 1) - 1; i++) n += cal.months[i].days;
  return n + (d.day ?? 1) - 1;
}

export function displayStoryDate(d: StoryDate, cal: Calendar): string {
  const year = d.year < 0 && !cal.era ? `${-d.year} BCE` : `${d.year}${cal.era ? ` ${cal.era}` : ''}`;
  if (d.month === undefined) return year;
  const month = cal.months[d.month - 1]?.name ?? `Month ${d.month}`;
  return d.day === undefined ? `${month} ${year}` : `${d.day} ${month} ${year}`;
}
