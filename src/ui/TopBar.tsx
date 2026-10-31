// M2 top bar (spec §8.2): sim clock, fps, mode; play/pause, speed, sim reset, scenario, mode, theme and help.
import { CONFIG } from '../shared/config.ts';
import { SCENARIOS } from '../shared/scenarios.ts';
import { appStore, useAppStore } from '../store/index.ts';
import type { SimSource, Speed } from '../store/slices/sim.ts';
import { actions } from './actions.ts';
import { formatClock } from './format.ts';
import { Button } from './kit.tsx';

const SELECT = 'rounded border border-slate-400 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800';

/** Sim clock and render rate. */
function Readouts() {
  const t_s = useAppStore((s) => s.sim.snapshot?.t_s ?? 0);
  const lagging = useAppStore((s) => s.sim.lagging);
  const fps = useAppStore((s) => s.ui.fps);
  return (
    <>
      <span data-testid="sim-clock" className="font-mono text-sm tabular-nums" title="Sim time (mm:ss.s)">
        {formatClock(t_s)}
      </span>
      {lagging && <span className="text-xs text-amber-500">lagging</span>}
      <span data-testid="fps" className="font-mono text-xs text-slate-500 tabular-nums">
        {Math.round(fps)} fps
      </span>
      <ModeLabel />
    </>
  );
}

/** What drives the app now, and for Live whether the bridge is connected. */
function ModeLabel() {
  const source = useAppStore((s) => s.sim.source);
  const status = useAppStore((s) => s.sim.live.status);
  const text = source === 'sim' ? 'Simulation' : source === 'replay' ? 'Replay' : `Live · ${status}`;
  return (
    <span data-testid="mode-label" className="rounded bg-slate-200 px-1.5 text-xs dark:bg-slate-800">
      {text}
    </span>
  );
}

/** Play/pause, speed, sim reset and the §12 scenario picker. */
function SimControls() {
  const sim = useAppStore((s) => s.sim.source === 'sim');
  const playing = useAppStore((s) => s.sim.playing);
  const speed = useAppStore((s) => s.sim.speed);
  const scenario = useAppStore((s) => s.sim.scenario);
  return (
    <>
      <button
        type="button"
        data-testid="btn-play"
        aria-pressed={playing}
        disabled={!sim}
        onClick={actions.togglePlay}
        title="Play / pause (Space)"
        className="w-16 rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <label className="text-xs">
        Speed{' '}
        <select
          data-testid="sel-speed"
          value={speed}
          disabled={!sim}
          onChange={(e) => actions.setSpeed(Number(e.target.value) as Speed)}
          className={SELECT}
        >
          {CONFIG.ui.speeds.map((x) => (
            <option key={x} value={x}>
              {x}×
            </option>
          ))}
        </select>
      </label>
      <Button testId="btn-sim-reset" disabled={!sim} onClick={actions.resetSim} title="Restart the simulation at t = 0">
        Reset sim
      </Button>
      <label className="text-xs">
        Scenario{' '}
        <select
          data-testid="sel-scenario"
          value={scenario?.id ?? ''}
          disabled={!sim}
          onChange={(e) => e.target.value && actions.playScenario(e.target.value)}
          className={SELECT}
        >
          <option value="">Free run</option>
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} {s.title}
            </option>
          ))}
        </select>
      </label>
      {scenario?.done && <span className="text-xs text-emerald-500">scenario done</span>}
    </>
  );
}

/** `sel-mode`: Simulation or Live (P8.2, the board through the bridge). */
function ModeSelect() {
  const source = useAppStore((s) => s.sim.source);
  return (
    <label className="text-xs">
      Mode{' '}
      <select
        data-testid="sel-mode"
        value={source}
        onChange={(e) => actions.setMode(e.target.value as SimSource)}
        className={SELECT}
        title="Live: the real board through the bridge (bridge-py)"
      >
        <option value="sim">Simulation</option>
        <option value="live">Live</option>
      </select>
    </label>
  );
}

/** The 48 px bar across the top of the app. */
export function TopBar() {
  return (
    <>
      <span className="mr-2 text-sm font-semibold">IoT PdM · Grupo 7</span>
      <Readouts />
      <span className="mx-1 h-5 border-l border-slate-300 dark:border-slate-700" />
      <SimControls />
      <span className="flex-1" />
      <ModeSelect />
      <Button testId="btn-theme" onClick={actions.toggleTheme} title="Light / dark theme">
        Theme
      </Button>
      <Button testId="btn-help" onClick={() => appStore.getState().ui.setLegendOpen(true)} title="Legend and help (?)">
        ?
      </Button>
    </>
  );
}
