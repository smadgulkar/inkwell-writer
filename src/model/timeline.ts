import { sceneOrder } from './binder';
import { dateKey, parseStoryDate, type Calendar, type StoryDate } from './calendar';
import type { MentionIndex } from './mentions';
import type { BinderNode, Doc } from './types';

export type EventScope = 'world' | 'story';

export interface TimelineItem {
  id: string;
  kind: 'event' | 'scene';
  title: string;
  date: StoryDate;
  end?: StoryDate;
  scope: EventScope;
  /** Characters, places and other entries involved. */
  entities: string[];
  /** For events: a linked scene. */
  scene?: string;
}

const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export const eventScopeOf = (d: Doc): EventScope => (d.fields.scope === 'story' ? 'story' : 'world');
export const eventEntities = (d: Doc) => strList(d.fields.entities);

export function buildTimeline(docs: Record<string, Doc>, binder: BinderNode[], cal: Calendar, index?: MentionIndex): { items: TimelineItem[]; undated: Doc[] } {
  const items: TimelineItem[] = [];
  const undated: Doc[] = [];
  for (const d of Object.values(docs)) {
    if (d.kind !== 'event') continue;
    const date = parseStoryDate(d.fields.date, cal);
    if (!date) {
      undated.push(d);
      continue;
    }
    const end = parseStoryDate(d.fields.end, cal) ?? undefined;
    items.push({
      id: d.id,
      kind: 'event',
      title: d.title || 'Untitled event',
      date,
      end: end && dateKey(end) > dateKey(date) ? end : undefined,
      scope: eventScopeOf(d),
      entities: eventEntities(d).filter((e) => docs[e]),
      scene: typeof d.fields.scene === 'string' && docs[d.fields.scene] ? d.fields.scene : undefined,
    });
  }
  const order = sceneOrder(binder);
  for (const id of order) {
    const s = docs[id];
    const date = s ? parseStoryDate(s.fields.storyDate, cal) : null;
    if (!s || !date) continue;
    const ents = new Set<string>(index?.byScene.get(id) ?? []);
    for (const k of ['pov', 'location'] as const) if (typeof s.fields[k] === 'string' && docs[s.fields[k] as string]) ents.add(s.fields[k] as string);
    items.push({ id, kind: 'scene', title: s.title || 'Untitled scene', date, scope: 'story', entities: [...ents] });
  }
  // Same date: world events first, then story events, then scenes in manuscript order.
  const rank = (i: TimelineItem) => (i.kind === 'scene' ? 2 : i.scope === 'world' ? 0 : 1);
  items.sort((a, b) => dateKey(a.date) - dateKey(b.date) || rank(a) - rank(b) || (a.kind === 'scene' && b.kind === 'scene' ? order.indexOf(a.id) - order.indexOf(b.id) : a.title.localeCompare(b.title)));
  return { items, undated: undated.sort((a, b) => a.title.localeCompare(b.title)) };
}
