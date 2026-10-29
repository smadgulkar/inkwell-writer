import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarOf, dateKey, dayNumber, displayStoryDate, GREGORIAN, parseStoryDate } from '../src/model/calendar';

const tides = calendarOf({ calendar: { name: 'Age of Tides', era: 'AT', months: [{ name: 'Thaw', days: 40 }, { name: 'Salt', days: 50 }, { name: 'Ash', days: '45' }] } });

test('parse partial and full dates, validated against the calendar', () => {
  assert.deepEqual(parseStoryDate('412', tides), { year: 412 });
  assert.deepEqual(parseStoryDate('412-2', tides), { year: 412, month: 2 });
  assert.deepEqual(parseStoryDate('412-2-50', tides), { year: 412, month: 2, day: 50 });
  assert.equal(parseStoryDate('412-2-51', tides), null, 'Salt has 50 days');
  assert.equal(parseStoryDate('412-4', tides), null, 'only 3 months');
  assert.deepEqual(parseStoryDate('-120', tides), { year: -120 });
  assert.equal(parseStoryDate('soon', tides), null);
  assert.deepEqual(parseStoryDate(1999, GREGORIAN), { year: 1999 });
});

test('sorting and spacing', () => {
  const dates = ['412-3-1', '411', '412', '412-1-40', '-5'].map((s) => parseStoryDate(s, tides)!);
  const sorted = [...dates].sort((a, b) => dateKey(a) - dateKey(b)).map((d) => [d.year, d.month, d.day].filter((x) => x !== undefined).join('-'));
  assert.deepEqual(sorted, ['-5', '411', '412', '412-1-40', '412-3-1']);
  assert.equal(dayNumber({ year: 1, month: 1, day: 1 }, tides) - dayNumber({ year: 0, month: 1, day: 1 }, tides), 135);
  assert.equal(dayNumber({ year: 0, month: 2, day: 1 }, tides), 40);
});

test('display', () => {
  assert.equal(displayStoryDate({ year: 412, month: 2, day: 9 }, tides), '9 Salt 412 AT');
  assert.equal(displayStoryDate({ year: 412 }, tides), '412 AT');
  assert.equal(displayStoryDate({ year: 1888, month: 10 }, GREGORIAN), 'October 1888');
  assert.equal(displayStoryDate({ year: -44 }, GREGORIAN), '44 BCE');
});
