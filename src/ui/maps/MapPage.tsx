import { useCallback, useEffect, useRef, useState } from 'react';
import { journeysOf, mapImageOf, mapParentOf, newPinId, pinsOf, serializeJourneys, serializePins, withoutPin, type MapPin } from '../../model/maps';
import type { Doc } from '../../model/types';
import { store, useStore } from '../../store/store';
import { imageFilesFrom, pickImages, saveImage, useAsset } from '../assets';
import { IconAddPin, IconArrow, IconFit, IconMap, IconReplaceImage, IconTrash, IconZoomIn, IconZoomOut } from '../icons';
import { characterOptions, Picker, worldOptions, type PickOption } from '../pickers';
import { MapCanvas, type CanvasApi } from './MapCanvas';
import { mapUi, useMapUi } from './mapState';

export function mapOptions(docs: Record<string, Doc>, exclude?: string): PickOption[] {
  return Object.values(docs)
    .filter((d) => d.kind === 'map' && d.id !== exclude)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((d) => ({ id: d.id, title: d.title || 'Untitled map', sub: 'Map', icon: <IconMap width={15} height={15} /> }));
}

export async function replaceMapImage(doc: Doc, file?: File) {
  const f = file ?? (await pickImages(false))[0];
  if (!f) return;
  try {
    const img = await saveImage(f);
    store.updateDoc(doc.id, { fields: { image: img.path, width: img.width, height: img.height } });
  } catch (e) {
    store.toast((e as Error).message);
  }
}

export async function createMapFromFile(parent?: string | null, title?: string) {
  const f = (await pickImages(false))[0];
  if (!f) return null;
  try {
    const img = await saveImage(f);
    return store.addMap(title ?? f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), img, parent);
  } catch (e) {
    store.toast((e as Error).message);
    return null;
  }
}

function PinEditor({ doc, pin, at, onClose }: { doc: Doc; pin: MapPin; at: { x: number; y: number }; onClose(): void }) {
  const docs = useStore((s) => s.project!.docs);
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(pin.label ?? '');
  useEffect(() => setLabel(pin.label ?? ''), [pin.id, pin.label]);
  const ent = pin.entity ? docs[pin.entity] : undefined;
  const options = [...worldOptions(docs), ...characterOptions(docs), ...mapOptions(docs, doc.id)];
  const update = (patch: Partial<MapPin>) =>
    store.updateDoc(doc.id, { fields: { pins: serializePins(pinsOf(doc).map((p) => (p.id === pin.id ? { ...p, ...patch } : p))) } });

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const box = ref.current?.parentElement?.getBoundingClientRect();
  const left = Math.max(12, Math.min(at.x + 18, (box?.width ?? 1200) - 312));
  const top = Math.max(12, Math.min(at.y - 30, (box?.height ?? 800) - 260));

  return (
    <div ref={ref} className="map-pop" style={{ left, top }} role="dialog" aria-label="Pin">
      <input
        className="input map-pop-title"
        value={label}
        placeholder={ent?.title ?? 'Pin label'}
        aria-label="Pin label"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label !== (pin.label ?? '') && update({ label })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <label className="map-pop-row">
        <span>Links to</span>
        <Picker
          compact
          label="Linked entry"
          placeholder="Choose a place, character or map"
          value={pin.entity ?? null}
          options={options}
          clearable
          onCreate={(name) => store.addWorld('place', name, null, { select: false })}
          createLabel="New place"
          onChange={(id) => update({ entity: id ?? undefined })}
        />
      </label>
      <div className="map-pop-actions">
        {ent ? (
          <button className="btn" onClick={() => store.select(ent.id)}>
            {ent.kind === 'map' ? 'Open map' : `Open ${ent.kind === 'character' ? 'character' : 'entry'}`} <IconArrow width={14} height={14} />
          </button>
        ) : (
          <button
            className="btn"
            onClick={async () => {
              const id = await createMapFromFile(doc.id, label || 'Detail map');
              if (id) {
                store.updateDoc(doc.id, { fields: { pins: serializePins(pinsOf(doc).map((p) => (p.id === pin.id ? { ...p, entity: id } : p))) } });
              }
            }}
            title="Make a detailed map for this spot, such as a city plan"
          >
            <IconMap width={14} height={14} /> Add a map here
          </button>
        )}
        <button
          className="icon-btn danger"
          aria-label="Delete pin"
          title="Delete pin"
          onClick={() => {
            store.updateDoc(doc.id, { fields: withoutPin(doc, pin.id) });
            onClose();
          }}
        >
          <IconTrash />
        </button>
      </div>
    </div>
  );
}

export function MapPage({ doc }: { doc: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const focusPin = useStore((s) => s.focusPin);
  const renaming = useStore((s) => s.renamingId === doc.id);
  const url = useAsset(mapImageOf(doc));
  const api = useRef<CanvasApi | null>(null);
  const mode = useMapUi((s) => s.mode);
  const selectedPin = useMapUi((s) => s.selectedPin);
  const journeyId = useMapUi((s) => s.journeyId);
  const [popAt, setPopAt] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dropping, setDropping] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => mapUi.enter(doc.id), [doc.id]);
  useEffect(() => {
    if (renaming) {
      titleRef.current?.focus();
      titleRef.current?.select();
      store.setRenaming(null);
    }
  }, [renaming]);

  // "Show on map" from another page.
  useEffect(() => {
    if (focusPin?.map !== doc.id) return;
    const t = setTimeout(() => {
      api.current?.centerOn(focusPin.pin);
      mapUi.set({ selectedPin: focusPin.pin });
      setPopAt(null);
      store.clearFocusPin();
    }, 60);
    return () => clearTimeout(t);
  }, [focusPin, doc.id, url]);

  const chain: Doc[] = [];
  for (let p = mapParentOf(doc); p && docs[p] && chain.length < 10; p = mapParentOf(docs[p])) chain.unshift(docs[p]);

  const onBackgroundClick = useCallback(
    (x: number, y: number, inside: boolean) => {
      const ui = mapUi.get();
      if (ui.mode === 'pin') {
        if (!inside) {
          store.toast('Click on the map itself to place the pin.');
          return;
        }
        const id = newPinId();
        store.updateDoc(doc.id, { fields: { pins: serializePins([...pinsOf(doc), { id, x, y }]) } });
        mapUi.set({ selectedPin: id, mode: 'view' });
        setPopAt(null);
        // Open the editor at the new pin once it renders.
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>('.map-pin.selected');
          const cr = document.querySelector('.map-canvas')?.getBoundingClientRect();
          if (el && cr) {
            const b = el.getBoundingClientRect();
            setPopAt({ x: b.left - cr.left + b.width / 2, y: b.top - cr.top + 14 });
          }
        });
        return;
      }
      if (ui.mode !== 'journey') {
        mapUi.set({ selectedPin: null });
        setPopAt(null);
      }
    },
    [doc],
  );

  const onPinClick = useCallback(
    (pin: MapPin, at: { x: number; y: number }) => {
      const ui = mapUi.get();
      if (ui.mode === 'journey' && ui.journeyId) {
        const js = journeysOf(doc).map((j) => (j.id === ui.journeyId ? { ...j, stops: [...j.stops, { pin: pin.id }] } : j));
        store.updateDoc(doc.id, { fields: { journeys: serializeJourneys(js) } });
        return;
      }
      mapUi.set({ selectedPin: pin.id });
      setPopAt(at);
    },
    [doc],
  );

  const onPinMove = useCallback(
    (id: string, x: number, y: number) => store.updateDoc(doc.id, { fields: { pins: serializePins(pinsOf(doc).map((p) => (p.id === id ? { ...p, x, y } : p))) } }),
    [doc],
  );

  const onZoom = useCallback((k: number, fitK: number) => setZoom(k / fitK), []);
  const selected = pinsOf(doc).find((p) => p.id === selectedPin);
  const editingJourney = journeysOf(doc).find((j) => j.id === journeyId);

  return (
    <div
      className={`map-page ${dropping ? 'dropping' : ''}`}
      onDragOver={(e) => {
        if (imageFilesFrom(e.dataTransfer).length || e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const f = imageFilesFrom(e.dataTransfer)[0];
        if (f) void replaceMapImage(doc, f);
      }}
    >
      <header className="map-bar">
        <div className="map-bar-title">
          {chain.length > 0 && (
            <nav className="crumbs" aria-label="Parent maps">
              {chain.map((d) => (
                <span key={d.id} style={{ display: 'contents' }}>
                  <button onClick={() => store.select(d.id)}>{d.title || 'Untitled map'}</button>
                  <span aria-hidden="true">/</span>
                </span>
              ))}
            </nav>
          )}
          <input
            ref={titleRef}
            className="map-title-input"
            value={doc.title}
            placeholder="Untitled map"
            aria-label="Map name"
            onChange={(e) => store.updateDoc(doc.id, { title: e.target.value })}
          />
        </div>
        <div className="map-tools" role="toolbar" aria-label="Map tools">
          <button
            className={`btn ${mode === 'pin' ? 'primary' : ''}`}
            aria-pressed={mode === 'pin'}
            onClick={() => mapUi.set({ mode: mode === 'pin' ? 'view' : 'pin', journeyId: null })}
            title="Click the map to place a pin"
          >
            <IconAddPin width={15} height={15} /> {mode === 'pin' ? 'Click the map…' : 'Add pin'}
          </button>
          <span className="map-zoom">
            <button className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => api.current?.zoomBy(1 / 1.4)}>
              <IconZoomOut />
            </button>
            <span className="map-zoom-val">{Math.round(zoom * 100)}%</span>
            <button className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => api.current?.zoomBy(1.4)}>
              <IconZoomIn />
            </button>
            <button className="icon-btn" aria-label="Fit map to window" title="Fit to window" onClick={() => api.current?.fit()}>
              <IconFit />
            </button>
          </span>
          <button className="btn ghost" onClick={() => void replaceMapImage(doc)} title="Use a different image; pins stay where they are">
            <IconReplaceImage width={15} height={15} /> {mapImageOf(doc) ? 'Replace image' : 'Choose image'}
          </button>
        </div>
      </header>

      {editingJourney && (
        <div className="map-banner" role="status">
          Click pins in order to add stops to <strong>{editingJourney.label || (editingJourney.character ? docs[editingJourney.character]?.title : 'this journey')}</strong>.
          <button className="btn primary" onClick={() => mapUi.set({ mode: 'view', journeyId: null })}>
            Done
          </button>
        </div>
      )}

      <div className="map-stage">
        <MapCanvas doc={doc} url={url} apiRef={api} onBackgroundClick={onBackgroundClick} onPinClick={onPinClick} onPinMove={onPinMove} onZoom={onZoom} />
        {selected && popAt && mode !== 'journey' && (
          <PinEditor
            doc={doc}
            pin={selected}
            at={popAt}
            onClose={() => {
              setPopAt(null);
              mapUi.set({ selectedPin: null });
            }}
          />
        )}
        {dropping && <div className="map-drop">Drop to use this image for the map</div>}
      </div>
    </div>
  );
}
