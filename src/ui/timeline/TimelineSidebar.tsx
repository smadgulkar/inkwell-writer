import { useMemo } from 'react';
import { displayStoryDate } from '../../model/calendar';
import { buildTimeline } from '../../model/timeline';
import { store, useStore } from '../../store/store';
import { IconPlus, IconTimeline } from '../icons';
import { useCalendar } from './TimelineParts';

export function TimelineSidebar() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const selected = useStore((s) => s.selectedId);
  const cal = useCalendar();
  const { items, undated } = useMemo(() => buildTimeline(docs, binder, cal), [docs, binder, cal]);
  const events = items.filter((i) => i.kind === 'event');
  return (
    <>
      <div className="sidebar-tools">
        <button className={`side-link ${selected === null ? 'on' : ''}`} onClick={() => store.showOverview('timeline')}>
          Timeline
        </button>
        <button className="icon-btn" title="New event" aria-label="New event" onClick={() => store.addEvent('world')}>
          <IconPlus />
        </button>
      </div>
      <div className="binder">
        {events.length === 0 && undated.length === 0 && <div className="binder-empty">Events from your world’s history and your story’s chronology appear here in order.</div>}
        {events.map((e) => (
          <div key={e.id} className={`brow entity tl-row ${selected === e.id ? 'selected' : ''}`} style={{ paddingLeft: 10 }} onClick={() => store.select(e.id)}>
            <span className={`tl-mini ${e.scope}`} aria-hidden="true" />
            <span className="btitle">{e.title}</span>
            <span className="bcount">{displayStoryDate({ year: e.date.year }, cal)}</span>
          </div>
        ))}
        {undated.length > 0 && <h3 className="side-group-title">Not dated</h3>}
        {undated.map((d) => (
          <div key={d.id} className={`brow entity ${selected === d.id ? 'selected' : ''}`} style={{ paddingLeft: 10 }} onClick={() => store.select(d.id)}>
            <IconTimeline className="kind" />
            <span className={`btitle ${d.title ? '' : 'placeholder'}`}>{d.title || 'Untitled event'}</span>
          </div>
        ))}
      </div>
    </>
  );
}
