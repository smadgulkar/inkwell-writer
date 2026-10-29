import { useSyncExternalStore } from 'react';

// Small UI state shared by the map canvas and the map inspector.

export type MapMode = 'view' | 'pin' | 'journey';

interface MapUi {
  mapId: string | null;
  selectedPin: string | null;
  mode: MapMode;
  journeyId: string | null;
}

let state: MapUi = { mapId: null, selectedPin: null, mode: 'view', journeyId: null };
const listeners = new Set<() => void>();

export const mapUi = {
  get: () => state,
  set(patch: Partial<MapUi>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  /** Reset when a different map opens. */
  enter(mapId: string) {
    if (state.mapId !== mapId) this.set({ mapId, selectedPin: null, mode: 'view', journeyId: null });
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useMapUi<T>(sel: (s: MapUi) => T): T {
  return useSyncExternalStore(mapUi.subscribe, () => sel(state));
}
