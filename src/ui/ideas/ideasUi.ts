// View state for the Ideas section (not saved in the project).
import { useSyncExternalStore } from 'react';
import type { IdeaStatus, IdeaType } from '../../model/ideas';

export type IdeasView = 'inbox' | 'type' | 'about';
interface IdeasUi {
  view: IdeasView;
  status: IdeaStatus | 'all';
  type: IdeaType | null;
  query: string;
}

let state: IdeasUi = { view: 'inbox', status: 'new', type: null, query: '' };
const subs = new Set<() => void>();

export const ideasUi = {
  get: () => state,
  set(patch: Partial<IdeasUi>) {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

export function useIdeasUi() {
  return useSyncExternalStore(ideasUi.subscribe, ideasUi.get);
}
