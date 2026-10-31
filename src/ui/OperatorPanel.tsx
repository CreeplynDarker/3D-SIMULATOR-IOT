// M5 operator panel (spec §8.2): model status, the latched indicator, START / E-STOP / RESET (with confirmation),
// TRAIN, warm start, and the threshold and firmware limits. Enable rules come from ui/rules.ts.
import { CONFIG } from '../shared/config.ts';
import { appStore, useAppStore } from '../store/index.ts';
import type { OperatorParams } from '../store/slices/ui.ts';
import { actions } from './actions.ts';
import { Button, Panel, ToggleButton } from './kit.tsx';
import { canReset, canStart, canTrain, modelStatusText } from './rules.ts';

const TRAIN_WINDOWS = CONFIG.rcf.nTrain + CONFIG.rcf.nHoldout;
const INPUT = 'w-20 rounded border border-slate-400 bg-white px-1 text-right dark:border-slate-600 dark:bg-slate-800';

/** A labelled number input that reports finite values only. */
function NumberField(props: {
  testId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (x: number) => void;
}) {
  // prettier-ignore
  return (
    <label className="flex items-center justify-between py-0.5 text-xs">
      <span>{props.label}</span>
      <input
        data-testid={props.testId}
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => {
          const x = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(x)) props.onChange(x);
        }}
        className={INPUT}
      />
    </label>
  );
}

/** START, E-STOP, RESET and TRAIN with the §8.2 enable rules; all off in Replay. */
function Commands() {
  const state = useAppStore((s) => s.sim.snapshot?.state ?? 'OFF');
  const faults = useAppStore((s) => s.sim.snapshot?.faults ?? null);
  const dtdt = useAppStore((s) => (s.series.rev, s.series.windows.last()?.dtdt_C_per_min ?? null));
  const replay = useAppStore((s) => s.sim.source === 'replay'); // a recording takes no commands (P8.3)
  const trainable = !replay && faults !== null && canTrain(state, faults, dtdt, CONFIG.rcf.warmDtdtMax_C_per_min);
  return (
    <div className="grid grid-cols-2 gap-1.5 py-1">
      <Button
        testId="btn-start"
        tone="go"
        disabled={replay || !canStart(state)}
        onClick={() => actions.command('START')}
        title="Start (S)"
      >
        START
      </Button>
      <Button
        testId="btn-estop"
        tone="stop"
        disabled={replay || state === 'OFF'}
        onClick={() => actions.command('ESTOP')}
        title="Emergency stop (E)"
      >
        E-STOP
      </Button>
      <Button
        testId="btn-reset"
        tone="warn"
        disabled={replay || !canReset(state)}
        onClick={actions.requestReset}
        title="Reset the latched trip (R)"
      >
        RESET
      </Button>
      <Button
        testId="btn-train"
        disabled={!trainable}
        onClick={actions.train}
        title="Retrain the RCF on 180 healthy NORMAL windows (120 to train, 60 holdout)"
      >
        TRAIN
      </Button>
    </div>
  );
}

/** Threshold and firmware limits; warm start applies at the next sim reset. */
function Settings() {
  const threshold = useAppStore((s) => s.model.threshold);
  const op = useAppStore((s) => s.ui.operator);
  const set = (p: Partial<OperatorParams>) => actions.setOperator(p);
  return (
    <div className="py-1">
      <NumberField
        testId="inp-threshold"
        label="RCF threshold"
        value={threshold}
        min={0.05}
        max={1}
        step={0.01}
        onChange={actions.setThreshold}
      />
      <NumberField
        testId="inp-n-critical"
        label="Persistence N (alerts to trip)"
        value={op.nCritical}
        min={1}
        max={20}
        step={1}
        onChange={(x) => set({ nCritical: Math.round(x) })}
      />
      <NumberField
        testId="inp-i-max"
        label="I_MAX (A)"
        value={op.iMax_A}
        min={0.05}
        max={1}
        step={0.01}
        onChange={(x) => set({ iMax_A: x })}
      />
      <NumberField
        testId="inp-t-max"
        label="T_MAX (°C)"
        value={op.tMax_C}
        min={20}
        max={100}
        step={1}
        onChange={(x) => set({ tMax_C: x })}
      />
      <div className="flex items-center justify-between py-0.5 text-xs">
        <span>Warm start (on sim reset)</span>
        <ToggleButton
          testId="tgl-warm-start"
          label={op.warmStart ? 'On' : 'Off'}
          on={op.warmStart}
          onChange={(on) => set({ warmStart: on })}
        />
      </div>
    </div>
  );
}

/** `dlg-reset-confirm`: RESET clears the latched trip only after the operator confirms. */
export function ResetDialog() {
  const open = useAppStore((s) => s.ui.resetDialogOpen);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div
        data-testid="dlg-reset-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        className="w-80 rounded bg-white p-4 text-sm shadow-xl dark:bg-slate-800"
      >
        <h2 id="reset-title" className="mb-2 font-semibold">
          Reset the latched trip?
        </h2>
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
          The ESP32 accepts RESET only once the fan has stopped (below {CONFIG.firmware.resetMaxRpm} rpm). The state
          goes to OFF; press START to run again.
        </p>
        <div className="flex justify-end gap-2">
          <Button testId="btn-reset-cancel" onClick={() => appStore.getState().ui.setResetDialogOpen(false)}>
            Cancel
          </Button>
          <Button testId="btn-reset-confirm" tone="warn" onClick={actions.confirmReset}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

/** P8.2: on the real bench, E-STOP is a message over Wi-Fi, not a safety stop. */
function EstopNote() {
  const live = useAppStore((s) => s.sim.source === 'live');
  if (!live) return null;
  return (
    <p
      data-testid="estop-note"
      role="note"
      className="rounded border border-red-500 px-2 py-1 text-xs text-red-600 dark:text-red-400"
    >
      E-STOP here is a command sent over Wi-Fi: it is not a safety stop. To stop the fan in an emergency, switch off the
      12 V supply.
    </p>
  );
}

/** The M5 panel under M4 in the left column. */
export function OperatorPanel() {
  const status = useAppStore((s) => s.model.status);
  const progress = useAppStore((s) => s.model.progress);
  const reason = useAppStore((s) => s.model.reason);
  const latched = useAppStore((s) => s.sim.snapshot?.state === 'CRITICAL');
  return (
    <Panel title="Operator (M5)" testId="operator-panel">
      <div className="flex items-center justify-between text-xs">
        <span>
          Model{' '}
          <span data-testid="model-status" className="font-mono font-semibold" title={reason ?? undefined}>
            {modelStatusText(status, progress, TRAIN_WINDOWS)}
          </span>
        </span>
        <span
          data-testid="latched-indicator"
          className={`font-semibold ${latched ? 'text-red-500' : 'text-slate-400'}`}
        >
          {latched ? 'LATCHED' : '—'}
        </span>
      </div>
      <Commands />
      <EstopNote />
      <Settings />
    </Panel>
  );
}
