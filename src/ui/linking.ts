import { store, useStore } from '../store/store';
import { characterOptions, worldOptions, type PickOption } from './pickers';

/** Props that let a ProseEditor link to characters and world entries. */
export function useEntityLinking() {
  const docs = useStore((s) => s.project?.docs);
  return {
    mentionOptions: (): PickOption[] => (docs ? [...characterOptions(docs), ...worldOptions(docs)] : []),
    onCreateMention: (name: string) => store.addCharacter(name, {}, { select: false }),
    onOpenLink: (id: string) => {
      if (store.get().project?.docs[id]) store.select(id);
      else store.toast('That item was deleted. The link text stays in your prose.');
    },
    titleOf: (id: string) => docs?.[id]?.title,
  };
}
