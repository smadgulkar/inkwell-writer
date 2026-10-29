import { customAlphabet } from 'nanoid';
import type { Doc } from './types';

// Maps: an image with pins. Pin positions are fractions of the image (0..1), so replacing
// the image with a higher-resolution copy keeps every pin in place.

const pinId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

export interface MapPin {
  id: string;
  x: number;
  y: number;
  label?: string;
  /** Any entry id: a place, character, other world entry, or another map (a nested map). */
  entity?: string;
}

export interface JourneyStop {
  pin: string;
  scene?: string;
}

export interface Journey {
  id: string;
  character?: string;
  label?: string;
  stops: JourneyStop[];
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && isFinite(Number(v)) ? Number(v) : d);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function newPinId() {
  return `pn_${pinId()}`;
}
export function newJourneyId() {
  return `jr_${pinId()}`;
}

export const mapImageOf = (d: Doc) => str(d.fields.image);
export const mapSizeOf = (d: Doc) => ({ w: num(d.fields.width, 1600), h: num(d.fields.height, 1000) });
export const mapParentOf = (d: Doc) => str(d.fields.parent);

export function pinsOf(d: Doc): MapPin[] {
  const p = d.fields.pins;
  if (!Array.isArray(p)) return [];
  return p
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .map((x) => ({ id: x.id as string, x: clamp01(num(x.x, 0.5)), y: clamp01(num(x.y, 0.5)), label: str(x.label), entity: str(x.entity) }));
}

export function journeysOf(d: Doc): Journey[] {
  const j = d.fields.journeys;
  if (!Array.isArray(j)) return [];
  return j
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .map((x) => ({
      id: x.id as string,
      character: str(x.character),
      label: str(x.label),
      stops: Array.isArray(x.stops) ? x.stops.filter((s: unknown) => s && typeof (s as JourneyStop).pin === 'string').map((s: JourneyStop) => ({ pin: s.pin, scene: str(s.scene) })) : [],
    }));
}

/** Round to 4 decimals so files stay readable. */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function serializePins(pins: MapPin[]) {
  return pins.map((p) => ({ id: p.id, x: r4(p.x), y: r4(p.y), label: p.label || undefined, entity: p.entity || undefined }));
}

export function serializeJourneys(js: Journey[]) {
  return js.map((j) => ({
    id: j.id,
    character: j.character || undefined,
    label: j.label || undefined,
    stops: j.stops.map((s) => ({ pin: s.pin, scene: s.scene || undefined })),
  }));
}

/** Every pin, on any map, that points at `entityId`. */
export function pinsFor(docs: Record<string, Doc>, entityId: string): { map: Doc; pin: MapPin }[] {
  const out: { map: Doc; pin: MapPin }[] = [];
  for (const d of Object.values(docs)) {
    if (d.kind !== 'map') continue;
    for (const pin of pinsOf(d)) if (pin.entity === entityId) out.push({ map: d, pin });
  }
  return out.sort((a, b) => a.map.title.localeCompare(b.map.title));
}

/** Remove a pin and every journey stop that used it. */
export function withoutPin(d: Doc, pinIdToRemove: string) {
  return {
    pins: serializePins(pinsOf(d).filter((p) => p.id !== pinIdToRemove)),
    journeys: serializeJourneys(journeysOf(d).map((j) => ({ ...j, stops: j.stops.filter((s) => s.pin !== pinIdToRemove) }))),
  };
}

export const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

export function mimeFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_TYPES[ext] ?? 'application/octet-stream';
}
