import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysOut, marketOf, submissionOf, submissionStats, submissionWarnings, type Market } from '../src/model/submissions';
import type { Doc } from '../src/model/types';

const sub = (id: string, f: Record<string, unknown>): Doc => ({ id, kind: 'submission', title: '', body: '', fields: f });
const mk = (id: string, title: string, f: Record<string, unknown>): Doc => ({ id, kind: 'market', title, body: '', fields: f });

test('warnings', () => {
  const markets: Record<string, Market> = {};
  for (const m of [mk('mk_strict01', 'Strict Review', { simultaneous: false, maxWords: 3000, responseDays: 30 }), mk('mk_open0001', 'Open Mag', {})]) markets[m.id] = marketOf(m);
  const all = [
    sub('sb_a', { market: 'mk_open0001', sent: '2026-01-01', status: 'rejected', response: '2026-02-01' }),
    sub('sb_b', { market: 'mk_open0001', sent: '2026-05-01', status: 'pending' }),
    sub('sb_c', { market: 'mk_strict01', sent: '2026-05-02', status: 'pending' }),
  ].map(submissionOf);
  const wb = submissionWarnings(all[1], all, markets, 4000, '2026-06-01');
  assert.ok(wb.some((w) => w.kind === 'rejected-before'));
  assert.ok(wb.some((w) => w.kind === 'elsewhere-no-sims'));
  const wc = submissionWarnings(all[2], all, markets, 4000, '2026-06-15');
  assert.ok(wc.some((w) => w.kind === 'market-no-sims'));
  assert.ok(wc.some((w) => w.kind === 'too-long'));
  assert.ok(wc.some((w) => w.kind === 'overdue'));
  assert.equal(daysOut(all[0], '2026-06-01'), 31);
  const st = submissionStats(all);
  assert.equal(st.out, 2);
  assert.equal(st.acceptanceRate, 0);
  assert.equal(st.avgResponseDays, 31);
});
