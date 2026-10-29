import { analyzeSubplots, subplotColorOf } from '../../model/subplots';
import { store, useStore } from '../../store/store';
import { IconAlert, IconPlus } from '../icons';
import { Corkboard } from './Corkboard';
import { ManuscriptView } from './ManuscriptView';
import { Outline } from './Outline';
import { PlotGrid } from './PlotGrid';
import { Progress } from './Progress';
import { PlanSwitcher, PLAN_VIEWS, SubplotSwatch } from './shared';

export function PlanPage() {
  const view = useStore((s) => s.ui.planView);
  const title = PLAN_VIEWS.find(([v]) => v === view)?.[1] ?? 'Plan';
  return (
    <article className={`page plan-page plan-${view}`}>
      <header className="overview-head">
        <h1 className="title-input" style={{ fontStyle: 'normal' }}>
          {title}
        </h1>
        <PlanSwitcher />
      </header>
      {view === 'corkboard' && <Corkboard />}
      {view === 'outline' && <Outline />}
      {view === 'grid' && <PlotGrid />}
      {view === 'manuscript' && <ManuscriptView />}
      {view === 'progress' && <Progress />}
    </article>
  );
}

export function PlanSidebar() {
  const docs = useStore((s) => s.project!.docs);
  const binder = useStore((s) => s.project!.meta.binder);
  const selected = useStore((s) => s.selectedId);
  const view = useStore((s) => s.ui.planView);
  const subplots = Object.values(docs)
    .filter((d) => d.kind === 'subplot')
    .sort((a, b) => a.title.localeCompare(b.title));
  const analysis = analyzeSubplots(binder, docs);
  return (
    <>
      <div className="sidebar-tools">
        <span className="label">Views</span>
      </div>
      <div className="binder" style={{ flex: 'none', paddingBottom: 8 }}>
        {PLAN_VIEWS.map(([v, label, Icon]) => (
          <div
            key={v}
            className={`brow entity ${!selected && view === v ? 'selected' : ''}`}
            style={{ paddingLeft: 10 }}
            onClick={() => {
              store.setUi({ planView: v });
              store.showOverview('plan');
            }}
          >
            <Icon className="kind" />
            <span className="btitle">{label}</span>
          </div>
        ))}
      </div>
      <div className="sidebar-tools" style={{ borderTop: '1px solid var(--line)' }}>
        <span className="label">Subplots</span>
        <button className="icon-btn" title="New subplot" aria-label="New subplot" onClick={() => store.addSubplot()}>
          <IconPlus />
        </button>
      </div>
      <div className="binder">
        {subplots.length === 0 && <div className="binder-empty">Subplots are the threads that run through your scenes. Add one to track it on the plot grid.</div>}
        {subplots.map((sp) => {
          const a = analysis.get(sp.id);
          const warn = a?.warnings.some((w) => w.kind === 'gap' || w.kind === 'unused');
          return (
            <div key={sp.id} className={`brow entity ${selected === sp.id ? 'selected' : ''}`} style={{ paddingLeft: 10 }} onClick={() => store.select(sp.id)}>
              <SubplotSwatch color={subplotColorOf(sp)} size={11} />
              <span className={`btitle ${sp.title ? '' : 'placeholder'}`}>{sp.title || 'Untitled subplot'}</span>
              {warn && <IconAlert className="warn-icon" aria-label="Needs attention" />}
              <span className="bcount">{a?.scenes.length || ''}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
