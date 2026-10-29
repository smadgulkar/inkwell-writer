import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hueOf, initials, worldKindOf } from '../../model/entities';
import { journeysOf, mapSizeOf, pinsOf, type MapPin } from '../../model/maps';
import type { Doc } from '../../model/types';
import { useStore } from '../../store/store';
import { IconMap, WORLD_ICON } from '../icons';
import { useMapUi } from './mapState';

interface View {
  x: number;
  y: number;
  k: number;
}

export interface CanvasApi {
  fit(): void;
  zoomBy(f: number): void;
  centerOn(pinId: string, zoom?: number): void;
}

interface Props {
  doc: Doc;
  url: string | null;
  apiRef: React.MutableRefObject<CanvasApi | null>;
  /** `inside` is false when the click landed off the map image. */
  onBackgroundClick(x: number, y: number, inside: boolean): void;
  onPinClick(pin: MapPin, screen: { x: number; y: number }): void;
  onPinMove(pinId: string, x: number, y: number): void;
  onZoom?(k: number, fitK: number): void;
}

export function journeyColor(characterId?: string) {
  return characterId ? `oklch(0.6 0.14 ${hueOf(characterId)})` : 'var(--accent)';
}

export function MapCanvas({ doc, url, apiRef, onBackgroundClick, onPinClick, onPinMove, onZoom }: Props) {
  const docs = useStore((s) => s.project!.docs);
  const selectedPin = useMapUi((s) => s.selectedPin);
  const mode = useMapUi((s) => s.mode);
  const journeyId = useMapUi((s) => s.journeyId);
  const wrap = useRef<HTMLDivElement>(null);
  const { w, h } = mapSizeOf(doc);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef<string | null>(null);
  const [dragPin, setDragPinState] = useState<{ id: string; x: number; y: number } | null>(null);
  // The live drag position: state drives rendering, the ref is what pointer-up commits.
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const setDragPin = (v: { id: string; x: number; y: number } | null) => {
    dragRef.current = v;
    setDragPinState(v);
  };

  const fitK = box.w && box.h ? Math.min(box.w / w, box.h / h) * 0.94 : 1;
  const minK = fitK * 0.6;
  const maxK = Math.max(fitK * 10, 3);

  const clampView = useCallback(
    (v: View): View => {
      const k = Math.min(maxK, Math.max(minK, v.k));
      // Keep at least a quarter of the map on screen.
      const mw = w * k;
      const mh = h * k;
      const x = Math.min(box.w - mw * 0.25, Math.max(-mw * 0.75, v.x));
      const y = Math.min(box.h - mh * 0.25, Math.max(-mh * 0.75, v.y));
      return { x, y, k };
    },
    [box.w, box.h, w, h, minK, maxK],
  );

  const fit = useCallback(() => {
    if (!box.w) return;
    setView({ k: fitK, x: (box.w - w * fitK) / 2, y: (box.h - h * fitK) / 2 });
  }, [box.w, box.h, w, h, fitK]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = viewRef.current;
      const k = Math.min(maxK, Math.max(minK, v.k * factor));
      const f = k / v.k;
      setView(clampView({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }));
    },
    [clampView, minK, maxK],
  );

  apiRef.current = {
    fit,
    zoomBy: (f) => zoomAt(f, box.w / 2, box.h / 2),
    centerOn: (pinId, zoom) => {
      const p = pinsOf(doc).find((x) => x.id === pinId);
      if (!p || !box.w) return;
      const k = Math.min(maxK, Math.max(viewRef.current.k, zoom ?? fitK * 2.2));
      setView(clampView({ k, x: box.w / 2 - p.x * w * k, y: box.h / 2 - p.y * h * k }));
    },
  };

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit when a map first opens or its image size changes.
  useEffect(() => {
    const key = `${doc.id}:${w}x${h}`;
    if (box.w && fitted.current !== key) {
      fitted.current = key;
      fit();
    }
  }, [doc.id, w, h, box.w, fit]);

  useEffect(() => onZoom?.(view.k, fitK), [view.k, fitK, onZoom]);

  // Wheel: zoom (pinch on trackpads sends ctrl+wheel); plain two-finger scroll pans.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const isPinch = e.ctrlKey;
      const isMouseWheel = Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && e.deltaMode === 0 && Number.isInteger(e.deltaY);
      if (isPinch || isMouseWheel || e.deltaMode !== 0) {
        zoomAt(Math.exp(-e.deltaY * (isPinch ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
      } else {
        const v = viewRef.current;
        setView(clampView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, clampView]);

  // Background drag pans; a click without movement places a pin (in pin mode) or deselects.
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.map-pin, .map-pop')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pan.current = { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (!p.moved && Math.hypot(dx, dy) < 4) return;
    p.moved = true;
    setView(clampView({ ...viewRef.current, x: p.vx + dx, y: p.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pan.current;
    pan.current = null;
    if (!p || p.moved) return;
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    const mx = (e.clientX - r.left - v.x) / (w * v.k);
    const my = (e.clientY - r.top - v.y) / (h * v.k);
    onBackgroundClick(mx, my, mx >= 0 && mx <= 1 && my >= 0 && my <= 1);
  };

  // Pin drag
  const pinDrag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const pinDown = (e: React.PointerEvent, pin: MapPin) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Remember where on the pin it was grabbed, so it doesn't jump under the cursor.
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    const px = r.left + v.x + pin.x * w * v.k;
    const py = r.top + v.y + pin.y * h * v.k;
    pinDrag.current = { id: pin.id, sx: e.clientX, sy: e.clientY, ox: e.clientX - px, oy: e.clientY - py, moved: false };
  };
  const pinMove = (e: React.PointerEvent) => {
    const d = pinDrag.current;
    if (!d || mode === 'journey') return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    setDragPin({
      id: d.id,
      x: Math.min(1, Math.max(0, (e.clientX - d.ox - r.left - v.x) / (w * v.k))),
      y: Math.min(1, Math.max(0, (e.clientY - d.oy - r.top - v.y) / (h * v.k))),
    });
  };
  const pinUp = (e: React.PointerEvent, pin: MapPin) => {
    const d = pinDrag.current;
    pinDrag.current = null;
    const final = dragRef.current;
    if (d?.moved && final) {
      onPinMove(pin.id, final.x, final.y);
      setDragPin(null);
      return;
    }
    setDragPin(null);
    const r = wrap.current!.getBoundingClientRect();
    onPinClick(pin, { x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const pins = pinsOf(doc).map((p) => (dragPin?.id === p.id ? { ...p, x: dragPin.x, y: dragPin.y } : p));
  const pinPos = new Map(pins.map((p) => [p.id, { x: view.x + p.x * w * view.k, y: view.y + p.y * h * view.k }]));
  const journeys = journeysOf(doc);

  return (
    <div
      ref={wrap}
      className={`map-canvas mode-${mode}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (pan.current = null)}
      role="application"
      aria-label={`Map: ${doc.title}`}
    >
      <div
        className="map-layer"
        style={{ width: w, height: h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        {url ? <img src={url} alt="" draggable={false} width={w} height={h} /> : <div className="map-blank" />}
      </div>

      <svg className="map-routes" width={box.w} height={box.h} aria-hidden="true">
        <defs>
          {journeys.map((j) => (
            <marker key={j.id} id={`arrow-${j.id}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M1 1L9 5L1 9z" fill={journeyColor(j.character)} />
            </marker>
          ))}
        </defs>
        {journeys.map((j) => {
          const pts = j.stops.map((s) => pinPos.get(s.pin)).filter(Boolean) as { x: number; y: number }[];
          if (pts.length < 2) return null;
          const active = mode === 'journey' && journeyId === j.id;
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
          return (
            <g key={j.id} className={`route ${active ? 'active' : ''} ${mode === 'journey' && !active ? 'dim' : ''}`}>
              <path d={d} className="route-halo" />
              <path d={d} className="route-line" stroke={journeyColor(j.character)} />
              {pts.slice(1).map((p, i) => {
                const a = pts[i];
                const mx = (a.x + p.x) / 2;
                const my = (a.y + p.y) / 2;
                return <path key={i} d={`M${a.x} ${a.y} L${mx} ${my}`} className="route-arrow" markerEnd={`url(#arrow-${j.id})`} />;
              })}
            </g>
          );
        })}
      </svg>

      <div className="map-pins">
        {pins.map((p) => {
          const pos = pinPos.get(p.id)!;
          const ent = p.entity ? docs[p.entity] : undefined;
          const label = p.label || ent?.title || 'Pin';
          const inJourney = mode === 'journey' && journeys.find((j) => j.id === journeyId)?.stops.some((s) => s.pin === p.id);
          let glyph: React.ReactNode;
          if (ent?.kind === 'character') glyph = <span className="pin-initials">{initials(ent.title)}</span>;
          else if (ent?.kind === 'world') {
            const I = WORLD_ICON[worldKindOf(ent)];
            glyph = <I />;
          } else if (ent?.kind === 'map') glyph = <IconMap />;
          else glyph = <span className="pin-dot" />;
          return (
            <button
              key={p.id}
              className={`map-pin ${selectedPin === p.id ? 'selected' : ''} ${ent?.kind === 'map' ? 'to-map' : ''} ${inJourney ? 'in-journey' : ''} ${dragPin?.id === p.id ? 'dragging' : ''}`}
              style={{ left: pos.x, top: pos.y, ['--pin-h' as string]: ent?.kind === 'character' ? hueOf(ent.id) : undefined }}
              onPointerDown={(e) => pinDown(e, p)}
              onPointerMove={pinMove}
              onPointerUp={(e) => pinUp(e, p)}
              aria-label={`${label}${ent && ent.title !== label ? ` (${ent.title})` : ''}`}
              title={mode === 'journey' ? `Add ${label} to the journey` : `${label}. Drag to move.`}
            >
              <span className={`pin-head ${ent?.kind === 'character' ? 'char' : ''}`}>{glyph}</span>
              <span className="pin-label">{label}</span>
            </button>
          );
        })}
      </div>
      {!url && <MapImageHint />}
    </div>
  );
}

function MapImageHint() {
  return (
    <div className="map-hint">
      <p>Drop a map image here, or choose one with Replace image.</p>
    </div>
  );
}
