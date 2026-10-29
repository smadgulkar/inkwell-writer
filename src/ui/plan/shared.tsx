import { sceneSubplots, subplotColorOf } from '../../model/subplots';
import type { Doc } from '../../model/types';
import { store, useStore, type PlanView } from '../../store/store';
import { IconCorkboard, IconGrid, IconManuscript, IconOutline, IconProgress } from '../icons';
import type { PickOption } from '../pickers';

export const PLAN_VIEWS: [PlanView, string, React.ComponentType<{ className?: string }>][] = [
  ['corkboard', 'Corkboard', IconCorkboard],
  ['outline', 'Outline', IconOutline],
  ['grid', 'Plot grid', IconGrid],
  ['manuscript', 'Manuscript', IconManuscript],
  ['progress', 'Progress', IconProgress],
];

export function SubplotSwatch({ color, size = 10 }: { color: number; size?: number }) {
  return <span className="sp-swatch" style={{ width: size, height: size, background: `var(--sp-${color})` }} aria-hidden="true" />;
}

/** Thin colored bars, one per subplot the scene belongs to. */
export function SubplotStripes({ scene }: { scene: Doc }) {
  const docs = useStore((s) => s.project!.docs);
  const ids = sceneSubplots(scene, docs);
  if (!ids.length) return null;
  return (
    <span className="sp-stripes" aria-label={`Subplots: ${ids.map((id) => docs[id].title).join(', ')}`}>
      {ids.map((id) => (
        <i key={id} title={docs[id].title} style={{ background: `var(--sp-${subplotColorOf(docs[id])})` }} />
      ))}
    </span>
  );
}

export function subplotOptions(docs: Record<string, Doc>): PickOption[] {
  return Object.values(docs)
    .filter((d) => d.kind === 'subplot')
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((d) => ({ id: d.id, title: d.title || 'Untitled subplot', icon: <SubplotSwatch color={subplotColorOf(d)} /> }));
}

export function PlanSwitcher() {
  const view = useStore((s) => s.ui.planView);
  const selected = useStore((s) => s.selectedId);
  return (
    <div className="segmented plan-switch" role="tablist" aria-label="Planning view">
      {PLAN_VIEWS.map(([v, label, Icon]) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v && !selected}
          aria-pressed={view === v && !selected}
          onClick={() => {
            store.setUi({ planView: v });
            store.showOverview('plan');
          }}
        >
          <Icon /> {label}
        </button>
      ))}
    </div>
  );
}
