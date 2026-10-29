// Submission tracking for short fiction: where a story went, what happened, and what to watch out for.
import { scenesUnder, sceneOrder } from './binder';
import { kindOf } from './ids';
import type { BinderNode, Doc } from './types';

export const SUB_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn', 'no-reply'] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];
export const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  'no-reply': 'No reply',
};

export interface Submission {
  id: string;
  market: string | null;
  /** A part or chapter of a collection; null means the whole project. */
  story: string | null;
  sent: string | null; // YYYY-MM-DD
  status: SubStatus;
  response: string | null;
  payment: string;
}

export interface Market {
  id: string;
  name: string;
  url: string;
  simultaneous: boolean;
  responseDays: number | null;
  pay: string;
  minWords: number | null;
  maxWords: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const date = (v: unknown) => (typeof v === 'string' && DATE_RE.test(v) ? v : null);
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);

export function submissionOf(d: Doc): Submission {
  const st = d.fields.status as SubStatus;
  return {
    id: d.id,
    market: typeof d.fields.market === 'string' && d.fields.market ? d.fields.market : null,
    story: typeof d.fields.story === 'string' && d.fields.story ? d.fields.story : null,
    sent: date(d.fields.sent),
    status: SUB_STATUSES.includes(st) ? st : 'pending',
    response: date(d.fields.response),
    payment: str(d.fields.payment),
  };
}

export function marketOf(d: Doc): Market {
  return {
    id: d.id,
    name: d.title || 'Untitled market',
    url: str(d.fields.url),
    simultaneous: d.fields.simultaneous !== false,
    responseDays: num(d.fields.responseDays),
    pay: str(d.fields.pay),
    minWords: num(d.fields.minWords),
    maxWords: num(d.fields.maxWords),
  };
}

export function daysBetweenKeys(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Days a submission has been (or was) out. */
export function daysOut(s: Submission, today: string) {
  if (!s.sent) return null;
  const end = s.status === 'pending' ? today : s.response ?? (s.status === 'no-reply' || s.status === 'withdrawn' ? null : today);
  return end ? Math.max(0, daysBetweenKeys(s.sent, end)) : null;
}

/** The stories a project can submit: the whole project, or each top-level part/chapter in a collection. */
export function storyOptions(binder: BinderNode[], docs: Record<string, Doc>, projectTitle: string) {
  const tops = binder.filter((n) => kindOf(n.id) === 'part' || kindOf(n.id) === 'chapter');
  const opts = [{ id: null as string | null, title: projectTitle || 'This story' }];
  if (tops.length > 1) for (const n of tops) opts.push({ id: n.id, title: docs[n.id]?.title || 'Untitled' });
  return opts;
}

export function storyWords(story: string | null, binder: BinderNode[], counts: Record<string, number>) {
  const ids = story ? scenesUnder(binder, story) : sceneOrder(binder);
  return ids.reduce((a, id) => a + (counts[id] ?? 0), 0);
}

export type SubWarning =
  | { kind: 'rejected-before'; other: string }
  | { kind: 'market-no-sims'; others: string[] }
  | { kind: 'elsewhere-no-sims'; others: string[] }
  | { kind: 'too-long'; words: number; max: number }
  | { kind: 'too-short'; words: number; min: number }
  | { kind: 'overdue'; days: number; expected: number };

/** Things worth flagging about one submission, given every other submission in the project. */
export function submissionWarnings(
  sub: Submission,
  all: Submission[],
  markets: Record<string, Market>,
  words: number,
  today: string,
): SubWarning[] {
  const out: SubWarning[] = [];
  const market = sub.market ? markets[sub.market] : undefined;
  const same = all.filter((o) => o.id !== sub.id && o.story === sub.story);
  if (sub.market) {
    const prior = same.find((o) => o.market === sub.market && o.status === 'rejected' && (!sub.sent || !o.sent || o.sent <= sub.sent));
    if (prior) out.push({ kind: 'rejected-before', other: prior.id });
  }
  if (sub.status === 'pending') {
    const otherPending = same.filter((o) => o.status === 'pending' && o.market !== sub.market);
    if (otherPending.length && market && !market.simultaneous) out.push({ kind: 'market-no-sims', others: otherPending.map((o) => o.id) });
    const strict = otherPending.filter((o) => o.market && markets[o.market] && !markets[o.market].simultaneous);
    if (strict.length) out.push({ kind: 'elsewhere-no-sims', others: strict.map((o) => o.id) });
    const d = daysOut(sub, today);
    if (market?.responseDays && d !== null && d > market.responseDays) out.push({ kind: 'overdue', days: d, expected: market.responseDays });
  }
  if (market?.maxWords && words > market.maxWords) out.push({ kind: 'too-long', words, max: market.maxWords });
  if (market?.minWords && words > 0 && words < market.minWords) out.push({ kind: 'too-short', words, min: market.minWords });
  return out;
}

export interface SubStats {
  total: number;
  out: number;
  accepted: number;
  decided: number;
  acceptanceRate: number | null;
  avgResponseDays: number | null;
}

export function submissionStats(all: Submission[]): SubStats {
  const decided = all.filter((s) => s.status === 'accepted' || s.status === 'rejected');
  const accepted = decided.filter((s) => s.status === 'accepted').length;
  const timed = decided.filter((s) => s.sent && s.response).map((s) => daysBetweenKeys(s.sent!, s.response!));
  return {
    total: all.length,
    out: all.filter((s) => s.status === 'pending').length,
    accepted,
    decided: decided.length,
    acceptanceRate: decided.length ? accepted / decided.length : null,
    avgResponseDays: timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null,
  };
}
