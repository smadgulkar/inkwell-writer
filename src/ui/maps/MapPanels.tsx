import { useState } from 'react';
import { journeysOf, mapImageOf, mapParentOf, newJourneyId, pinsOf, serializeJourneys, type Journey } from '../../model/maps';
import type { Doc } from '../../model/types';
import { store, useStore } from '../../store/store';
import { useAsset } from '../assets';
import { confirmDelete } from '../Binder';
import { IconMap, IconPlus, IconRoute, IconX } from '../icons';
import { characterOptions, Picker, sceneOptions } from '../pickers';
import { journeyColor } from './MapCanvas';
import { createMapFromFile, mapOptions } from './MapPage';
import { mapUi, useMapUi } from './mapState';

function pinLabel(docs: Record<string, Doc>, map: Doc, pinId: string) {
  const p = pinsOf(map).find((x) => x.id === pinId);
  if (!p) return 'Missing pin';
  return p.label || (p.entity && docs[p.entity]?.title) || 'Pin';
}

// ---------- inspector ----------

export function MapInspector({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const selectedPin = useMapUi((s) => s.selectedPin);
  const journeyId = useMapUi((s) => s.journeyId);
  const pins = pinsOf(doc);
  const journeys = journeysOf(doc);
  const setJourneys = (js: Journey[]) => store.updateDoc(doc.id, { fields: { journeys: serializeJourneys(js) } });
  const scenes = sceneOptions(docs, binder);

  return (
    <>
      <section className="insp-section">
        <div className="insp-label">
          Pins <span className="hint">{pins.length}</span>
        </div>
        {pins.length === 0 ? (
          <p className="muted insp-note">Use Add pin, then click the map. Pins can link to places, characters or a more detailed map.</p>
        ) : (
          <ul className="pin-list">
            {pins
              .slice()
              .sort((a, b) => pinLabel(docs, doc, a.id).localeCompare(pinLabel(docs, doc, b.id)))
              .map((p) => {
                const ent = p.entity ? docs[p.entity] : undefined;
                return (
                  <li key={p.id}>
                    <button className={selectedPin === p.id ? 'on' : ''} onClick={() => store.showPin(doc.id, p.id)}>
                      <span className="pl-dot" aria-hidden="true" />
                      <span className="pl-name">{pinLabel(docs, doc, p.id)}</span>
                      {ent && <span className="pl-kind">{ent.kind === 'world' ? (ent.fields.kind as string) : ent.kind}</span>}
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className="insp-section">
        <div className="insp-label">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconRoute width={13} height={13} /> Journeys
          </span>
          <button
            className="icon-btn"
            style={{ width: 24, height: 24 }}
            aria-label="New journey"
            title="New journey"
            disabled={pins.length < 2}
            onClick={() => {
              const id = newJourneyId();
              setJourneys([...journeys, { id, stops: [] }]);
              mapUi.set({ mode: 'journey', journeyId: id, selectedPin: null });
            }}
          >
            <IconPlus />
          </button>
        </div>
        {journeys.length === 0 && <p className="muted insp-note">{pins.length < 2 ? 'Add at least two pins to trace a journey.' : 'Trace a character’s route from pin to pin.'}</p>}
        <div className="journeys">
          {journeys.map((j) => {
            const editing = journeyId === j.id;
            return (
              <div key={j.id} className={`journey ${editing ? 'editing' : ''}`} style={{ ['--jc' as string]: journeyColor(j.character) }}>
                <div className="journey-head">
                  <span className="journey-swatch" aria-hidden="true" />
                  <Picker
                    compact
                    label="Traveler"
                    placeholder="Who travels?"
                    value={j.character ?? null}
                    options={characterOptions(docs)}
                    onChange={(id) => setJourneys(journeys.map((x) => (x.id === j.id ? { ...x, character: id ?? undefined } : x)))}
                  />
                  <button
                    className="icon-btn"
                    aria-label="Delete journey"
                    title="Delete journey"
                    onClick={() => {
                      setJourneys(journeys.filter((x) => x.id !== j.id));
                      if (editing) mapUi.set({ mode: 'view', journeyId: null });
                    }}
                  >
                    <IconX />
                  </button>
                </div>
                <ol className="stops">
                  {j.stops.map((s, i) => (
                    <li key={i}>
                      <span className="stop-n">{i + 1}</span>
                      <span className="stop-body">
                        <span className="stop-name">{pinLabel(docs, doc, s.pin)}</span>
                        <Picker
                          compact
                          label="Scene"
                          placeholder="Link a scene"
                          value={s.scene ?? null}
                          options={scenes}
                          clearable
                          onChange={(id) =>
                            setJourneys(journeys.map((x) => (x.id === j.id ? { ...x, stops: x.stops.map((st, k) => (k === i ? { ...st, scene: id ?? undefined } : st)) } : x)))
                          }
                        />
                      </span>
                      <button
                        className="icon-btn row-x"
                        aria-label="Remove stop"
                        onClick={() => setJourneys(journeys.map((x) => (x.id === j.id ? { ...x, stops: x.stops.filter((_, k) => k !== i) } : x)))}
                      >
                        <IconX />
                      </button>
                    </li>
                  ))}
                </ol>
                <button className="add-link" onClick={() => mapUi.set(editing ? { mode: 'view', journeyId: null } : { mode: 'journey', journeyId: j.id, selectedPin: null })}>
                  {editing ? 'Done adding stops' : j.stops.length ? 'Add more stops' : 'Click pins to add stops'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="insp-section">
        <div className="insp-label">Inside</div>
        <Picker
          compact
          label="Parent map"
          placeholder="Top level"
          value={mapParentOf(doc) ?? null}
          options={mapOptions(docs, doc.id)}
          clearable
          onChange={(id) => store.updateDoc(doc.id, { fields: { parent: id ?? undefined } })}
        />
      </section>
      <section className="insp-section">
        <button className="btn ghost danger" onClick={() => confirmDelete(doc.id)}>
          Delete map
        </button>
        <p className="muted insp-note" style={{ marginTop: 8 }}>
          The image stays in the project’s assets folder.
        </p>
      </section>
    </>
  );
}

// ---------- overview ----------

function MapThumb({ doc }: { doc: Doc }) {
  const url = useAsset(mapImageOf(doc));
  return <span className="map-thumb">{url ? <img src={url} alt="" /> : <IconMap />}</span>;
}

export function MapsOverview() {
  const docs = useStore((s) => s.project!.docs);
  const maps = Object.values(docs)
    .filter((d) => d.kind === 'map')
    .sort((a, b) => Number(!!mapParentOf(a)) - Number(!!mapParentOf(b)) || a.title.localeCompare(b.title));
  return (
    <article className="page wide">
      <header className="overview-head">
        <h1 className="title-input" style={{ fontStyle: 'normal' }}>
          Maps
        </h1>
        <button className="btn primary" onClick={() => void createMapFromFile()}>
          <IconPlus /> New map
        </button>
      </header>
      {maps.length === 0 ? (
        <div className="empty-state">
          <p>Bring in any map image, hand-drawn, scanned or made in a map tool, then pin your places and trace each character’s journey across it.</p>
          <button className="btn primary" onClick={() => void createMapFromFile()}>
            Choose a map image
          </button>
        </div>
      ) : (
        <div className="map-cards">
          {maps.map((m) => (
            <button key={m.id} className="map-card" onClick={() => store.select(m.id)}>
              <MapThumb doc={m} />
              <span className="map-card-body">
                <span className="card-title">{m.title || 'Untitled map'}</span>
                <span className="card-meta">
                  <span>{mapParentOf(m) && docs[mapParentOf(m)!] ? `in ${docs[mapParentOf(m)!].title}` : 'Top level'}</span>
                  <span>
                    {pinsOf(m).length} {pinsOf(m).length === 1 ? 'pin' : 'pins'}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

// ---------- sidebar ----------

export function MapList() {
  const docs = useStore((s) => s.project!.docs);
  const selected = useStore((s) => s.selectedId);
  const [busy, setBusy] = useState(false);
  const maps = Object.values(docs).filter((d) => d.kind === 'map');
  const children = (parent: string | null) =>
    maps.filter((m) => (mapParentOf(m) && docs[mapParentOf(m)!] ? mapParentOf(m)! : null) === parent).sort((a, b) => a.title.localeCompare(b.title));
  const row = (m: Doc, depth: number): React.ReactNode => (
    <div key={m.id}>
      <div className={`brow entity ${selected === m.id ? 'selected' : ''}`} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => store.select(m.id)}>
        <IconMap className="kind" />
        <span className={`btitle ${m.title ? '' : 'placeholder'}`}>{m.title || 'Untitled map'}</span>
        <span className="bcount">{pinsOf(m).length || ''}</span>
      </div>
      {children(m.id).map((c) => row(c, depth + 1))}
    </div>
  );
  return (
    <>
      <div className="sidebar-tools">
        <button className={`side-link ${selected === null ? 'on' : ''}`} onClick={() => store.showOverview('maps')}>
          Maps
        </button>
        <button
          className="icon-btn"
          title="New map"
          aria-label="New map"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await createMapFromFile();
            setBusy(false);
          }}
        >
          <IconPlus />
        </button>
      </div>
      <div className="binder">
        {maps.length === 0 && <div className="binder-empty">No maps yet. Add one with the + button.</div>}
        {children(null).map((m) => row(m, 0))}
      </div>
    </>
  );
}

/** "On maps" list for a character or world page. */
export function OnMaps({ id }: { id: string }) {
  const docs = useStore((s) => s.project!.docs);
  const hits: { map: Doc; pinId: string; label: string }[] = [];
  for (const d of Object.values(docs)) {
    if (d.kind !== 'map') continue;
    for (const p of pinsOf(d)) if (p.entity === id) hits.push({ map: d, pinId: p.id, label: d.title || 'Untitled map' });
    for (const j of journeysOf(d)) if (j.character === id && j.stops.length && !hits.some((h) => h.map.id === d.id)) hits.push({ map: d, pinId: j.stops[0].pin, label: `${d.title || 'Untitled map'} (journey)` });
  }
  if (!hits.length) return null;
  return (
    <section className="insp-section">
      <div className="insp-label">On maps</div>
      <div className="chips">
        {hits.map((h) => (
          <button key={h.map.id + h.pinId} className="chip" onClick={() => store.showPin(h.map.id, h.pinId)}>
            <IconMap width={13} height={13} /> {h.label}
          </button>
        ))}
      </div>
    </section>
  );
}

