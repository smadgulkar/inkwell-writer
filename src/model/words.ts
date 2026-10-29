import { markdownToText } from './markdown';

const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function countText(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

export function countMarkdown(md: string): number {
  return countText(markdownToText(md));
}

/** Short-story length bands commonly used by markets (SFWA-style). */
export const LENGTH_BANDS = [
  { name: 'Flash fiction', max: 1000 },
  { name: 'Short story', max: 7500 },
  { name: 'Novelette', max: 17500 },
  { name: 'Novella', max: 40000 },
  { name: 'Novel', max: Infinity },
] as const;

export function lengthBand(words: number) {
  return LENGTH_BANDS.find((b) => words < b.max || b.max === Infinity)!;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}
