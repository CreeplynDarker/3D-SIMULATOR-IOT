// M11 guided scenarios (spec §8.2, §12): a card over the viewport's bottom-left with the step text and step k/n.
// Steps advance by themselves as their triggers fire (shared/guided.ts); Back and Next revisit them.
import { useEffect } from 'react';
import { guidedFor, reachedStep } from '../shared/guided.ts';
import { scenarioById } from '../shared/scenarios.ts';
import { appStore, useAppStore } from '../store/index.ts';
import { actions } from './actions.ts';
import { Button } from './kit.tsx';

/** Moves the card to each newly reached step (and its camera and chart) as the run goes on. */
function useAutoAdvance(): void {
  useEffect(() => {
    const check = () => {
      const s = appStore.getState();
      const g = s.ui.guided;
      const script = g && guidedFor(g.id);
      if (!g || !script) return;
      const done = s.sim.scenario?.id === g.id && s.sim.scenario.done;
      const reached = reachedStep(script.steps, { t_s: s.sim.snapshot?.t_s ?? 0, events: s.series.events.toArray(), done }); // prettier-ignore
      if (reached > g.reached) {
        s.ui.setGuided({ ...g, reached });
        actions.showGuidedStep(reached);
      }
    };
    actions.showGuidedStep(appStore.getState().ui.guided?.view ?? 0);
    return appStore.subscribe((s, prev) => {
      if (s.ui.guided && (s.sim.snapshot !== prev.sim.snapshot || s.sim.scenario !== prev.sim.scenario)) check();
    });
  }, []);
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <p className="mt-1">
      <span className="font-semibold text-slate-500 dark:text-slate-400">{label}: </span>
      {text}
    </p>
  );
}

/** The card itself; mounted while a guided scenario is open. */
function Card({ id, view, reached }: { id: string; view: number; reached: number }) {
  useAutoAdvance();
  const script = guidedFor(id);
  const step = script?.steps[view];
  if (!script || !step) return null;
  const n = script.steps.length;
  return (
    <div
      data-testid="scenario-card"
      data-step={view + 1}
      data-steps={n}
      data-reached={reached + 1}
      className="absolute bottom-14 left-3 w-96 max-w-[calc(100%-1.5rem)] rounded bg-white/95 p-3 text-xs shadow-lg dark:bg-slate-900/95"
    >
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
        <span>
          Guided {id} · {scenarioById(id).title} · {script.speed}×
        </span>
        <span data-testid="scenario-step">
          step {view + 1}/{n}
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
      <Field label="Watch" text={step.watch} />
      <Field label="Injected" text={step.injected} />
      <Field label="State" text={step.meaning} />
      <p className="mt-1 text-slate-500 dark:text-slate-400">
        Camera: {step.camera} · chart: {step.chart.replace('chart-', '')}
      </p>
      <div className="mt-2 flex gap-1.5">
        <Button testId="btn-scn-back" disabled={view === 0} onClick={() => actions.showGuidedStep(view - 1)}>
          Back
        </Button>
        <Button testId="btn-scn-next" disabled={view >= n - 1} onClick={() => actions.showGuidedStep(view + 1)}>
          Next
        </Button>
        <span className="flex-1" />
        <Button testId="btn-scn-exit" onClick={actions.exitGuided}>
          Exit
        </Button>
      </div>
    </div>
  );
}

/** M11 over the viewport: nothing unless a guided scenario is open. */
export function Scenarios() {
  const guided = useAppStore((s) => s.ui.guided);
  return guided ? <Card key={guided.id} {...guided} /> : null;
}
