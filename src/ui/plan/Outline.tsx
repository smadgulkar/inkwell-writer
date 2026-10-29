import { useState } from 'react';
import { sceneGroups, sceneSubplots, subplotColorOf } from '../../model/subplots';
import { STATUSES, type Doc, type Status } from '../../model/types';
import { store, useStore } from '../../store/store';
import { IconArrow, IconPlus, IconSort, IconX } from '../icons';
import { AutoTextarea } from '../Page';
import { characterOptions, Picker, PickList, worldOptions } from '../pickers';
import { subplotOptions } from './shared';

type SortKey = 'order' | 'title' | 'status' | 'words';

function SubplotCell({ scene }: { scene: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const [open, setOpen] = useState(false);
  const ids = sceneSubplots(scene, docs);
  const options = subplotOptions(docs).filter((o) => !ids.includes(o.id));
  return (
    <div className="ol-subplots">
      {ids.map((id) => (
        <span key={id} className="sp-chip" style={{ ['--c' as string]: `var(--sp-${subplotColorOf(docs[id])})` }}>
          {docs[id].title}
          <button aria-label={`Remove ${docs[id].title}`} onClick={() => store.setSceneSubplot(scene.id, id, false)}>
            <IconX />
          </button>
        </span>
      ))}
      <span style={{ position: 'relative' }}>
        <button className="icon-btn ol-add" aria-label="Add subplot" title="Add subplot" onClick={() => setOpen(!open)}>
          <IconPlus />
        </button>
        {open && (
          <PickList
            label="Subplot"
            options={options}
            onClose={() => setOpen(false)}
            onPick={(id) => {
              setOpen(false);
              store.setSceneSubplot(scene.id, id, true);
            }}
            onCreate={(name) => store.addSubplot(name, { select: false })}
            createLabel="New subplot"
            style={{ right: 0, left: 'auto' }}
          />
        )}
      </span>
    </div>
  );
}

export function Outline() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const counts = useStore((s) => s.counts);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  const groups = sceneGroups(binder, docs);
  const chars = characterOptions(docs);
  const places = worldOptions(docs);

  const sorted = (ids: string[]) => {
    if (sort.key === 'order') return sort.dir === 1 ? ids : [...ids].reverse();
    const val = (id: string): string | number => {
      const d = docs[id];
      if (sort.key === 'title') return (d?.title ?? '').toLowerCase();
      if (sort.key === 'words') return counts[id] ?? 0;
      return STATUSES.indexOf(((d?.fields.status as Status) ?? 'draft') as Status);
    };
    return [...ids].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  };
  const header = (key: SortKey, label: string, cls = '') => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key ? <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span> : <IconSort className="th-sort-icon" />}
      </button>
    </th>
  );

  let n = 0;
  return (
    <div className="outline-wrap">
      <table className="outline-table">
        <thead>
          <tr>
            {header('order', '#', 'col-num')}
            {header('title', 'Scene', 'col-title')}
            <th className="col-syn">Synopsis</th>
            {header('status', 'Status', 'col-status')}
            <th className="col-pov">Point of view</th>
            <th className="col-loc">Location</th>
            <th className="col-sp">Subplots</th>
            {header('words', 'Words', 'col-words')}
          </tr>
        </thead>
        {groups.map((g) => {
          const words = g.scenes.reduce((a, s) => a + (counts[s] ?? 0), 0);
          return (
            <tbody key={g.id ?? 'root'}>
              <tr className="ol-group">
                <th colSpan={7} scope="rowgroup">
                  {g.id ? <button onClick={() => store.select(g.id!)}>{g.title}</button> : g.title}
                </th>
                <td className="num">{words.toLocaleString()}</td>
              </tr>
              {sorted(g.scenes).map((sid) => {
                const d = docs[sid];
                if (!d) return null;
                n++;
                const status = (d.fields.status as Status) ?? 'draft';
                const target = Number(d.fields.target) || 0;
                const w = counts[sid] ?? 0;
                return (
                  <tr key={sid}>
                    <td className="col-num">
                      <button className="ol-open" title="Open scene" aria-label={`Open ${d.title}`} onClick={() => store.select(sid)}>
                        <span>{n}</span>
                        <IconArrow />
                      </button>
                    </td>
                    <td className="col-title">
                      <input className="ol-input ol-title" value={d.title} placeholder="Untitled scene" aria-label="Scene title" onChange={(e) => store.updateDoc(sid, { title: e.target.value })} />
                    </td>
                    <td className="col-syn">
                      <AutoTextarea
                        className="ol-input"
                        value={String(d.fields.synopsis ?? '')}
                        placeholder="—"
                        aria-label="Synopsis"
                        onChange={(e) => store.updateDoc(sid, { fields: { synopsis: e.target.value.replace(/\n/g, ' ') } })}
                      />
                    </td>
                    <td className="col-status">
                      <label className="ol-status">
                        <span className={`status-dot ${status}`} />
                        <select value={status} aria-label="Status" onChange={(e) => store.updateDoc(sid, { fields: { status: e.target.value } })}>
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td className="col-pov">
                      <Picker
                        compact
                        label="Point of view"
                        placeholder="—"
                        value={typeof d.fields.pov === 'string' ? d.fields.pov : null}
                        options={chars}
                        clearable
                        onChange={(id) => store.updateDoc(sid, { fields: { pov: id ?? undefined } })}
                      />
                    </td>
                    <td className="col-loc">
                      <Picker
                        compact
                        label="Location"
                        placeholder="—"
                        value={typeof d.fields.location === 'string' ? d.fields.location : null}
                        options={places}
                        clearable
                        onChange={(id) => store.updateDoc(sid, { fields: { location: id ?? undefined } })}
                      />
                    </td>
                    <td className="col-sp">
                      <SubplotCell scene={d} />
                    </td>
                    <td className="col-words num">
                      {w.toLocaleString()}
                      {target ? <span className="muted"> / {target.toLocaleString()}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
      {groups.length === 0 && <p className="muted">No scenes yet.</p>}
    </div>
  );
}
