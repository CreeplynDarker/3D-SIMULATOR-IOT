// M4 fault injection (spec §8.2): one slider per numeric fault (ranges from CONFIG.faults), the DS18B20 disconnect
// switch, an optional ramp and "clear all". Each row shows the live value the plant is using now.
import { CONFIG } from '../shared/config.ts';
import type { NumericFaultKey } from '../shared/messages.ts';
import { appStore, useAppStore } from '../store/index.ts';
import { actions } from './actions.ts';
import { Button, Panel, ToggleButton } from './kit.tsx';

/** Each fault with the feature it moves (help text, §6.9). */
const SLIDERS: { id: string; fault: NumericFaultKey; label: string; unit: string; help: string }[] = [
  {
    id: 'imbalance',
    fault: 'imbalance_g',
    label: 'Imbalance',
    unit: 'g',
    help: 'Extra mass on one blade, in grams, 28 mm from the axis (not g of acceleration): raises a_RMS.',
  },
  {
    id: 'looseness',
    fault: 'looseness',
    label: 'Looseness',
    unit: '',
    help: 'Loose mounting, 0–1: impacts raise the crest factor (CF) and a_RMS.',
  },
  {
    id: 'friction',
    fault: 'friction',
    label: 'Friction',
    unit: '',
    help: 'Bearing friction, 0–1: the fan slows (RPM) and draws more current (I_RMS).',
  },
  {
    id: 'overheat',
    fault: 'overheat',
    label: 'Overheat',
    unit: '',
    help: 'Hotter air around the motor, 0–1 (up to +35 °C): raises T and dT/dt.',
  },
  {
    id: 'sag',
    fault: 'supplySag_V',
    label: 'Supply sag',
    unit: 'V',
    help: 'The 12 V supply drops by this much: the fan slows and draws less current.',
  },
  {
    id: 'loss',
    fault: 'packetLoss',
    label: 'Wi-Fi packet loss',
    unit: '',
    help: 'Share of packets the Wi-Fi drops, 0–1. After 5 s with no verdict the ESP32 flags link_lost and only its local limits can trip.',
  },
];

/** One fault slider with its target and live value. */
function FaultSlider({ id, fault: faultKey, label, unit, help }: (typeof SLIDERS)[number]) {
  const target = useAppStore((s) => s.ui.faultTargets[faultKey]);
  const live = useAppStore((s) => s.sim.snapshot?.faults[faultKey] ?? 0);
  const range = CONFIG.faults[faultKey];
  return (
    <label className="block py-1 text-xs" title={help}>
      <span className="flex justify-between">
        <span>{label}</span>
        <span data-testid={`val-${id}`} className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {live.toFixed(2)} {unit}
        </span>
      </span>
      <input
        data-testid={`sld-${id}`}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={target}
        onChange={(e) => actions.setFault(faultKey, Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

/** Ramp switch and ramp time (s of sim time). */
function RampControls() {
  const ramp = useAppStore((s) => s.ui.ramp);
  const setRamp = appStore.getState().ui.setRamp;
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <ToggleButton testId="tgl-ramp" label="Ramp" on={ramp.on} onChange={(on) => setRamp({ ...ramp, on })} />
      <label className="flex items-center gap-1">
        over
        <input
          data-testid="inp-ramp-s"
          type="number"
          min={0}
          step={1}
          value={ramp.ramp_s}
          onChange={(e) => setRamp({ ...ramp, ramp_s: Number(e.target.value) })}
          className="w-14 rounded border border-slate-400 bg-white px-1 dark:border-slate-600 dark:bg-slate-800"
        />
        s
      </label>
    </div>
  );
}

/** The M4 panel at the top of the left column. */
export function FaultPanel() {
  const disconnected = useAppStore((s) => s.ui.faultTargets.ds18b20Disconnect);
  const liveDisconnected = useAppStore((s) => s.sim.snapshot?.faults.ds18b20Disconnect ?? false);
  return (
    <Panel title="Fault injection (M4)" testId="fault-panel">
      {SLIDERS.map((s) => (
        <FaultSlider key={s.id} {...s} />
      ))}
      <div className="flex items-center justify-between py-1 text-xs">
        <ToggleButton
          testId="tgl-ds-disconnect"
          label="Disconnect DS18B20"
          on={disconnected}
          onChange={(on) => actions.setFault('ds18b20Disconnect', on)}
        />
        <span data-testid="val-ds-disconnect" className="font-mono text-slate-500 dark:text-slate-400">
          {liveDisconnected ? 'open' : 'connected'}
        </span>
      </div>
      <RampControls />
      <Button testId="btn-clear-faults" onClick={actions.clearFaults}>
        Clear all faults
      </Button>
    </Panel>
  );
}
