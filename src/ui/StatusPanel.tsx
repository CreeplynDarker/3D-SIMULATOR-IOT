// M3 status panel (spec §8.2): firmware state, RCF score against the threshold, dominant variable, persistence,
// relay, speed, link and sensor flags and the trip reason. It only reads the snapshot and the last verdict.
import type { ReactNode } from 'react';
import { useAppStore } from '../store/index.ts';
import { formatGauge, persistenceText, relayText, STATE_TONE, TONE_CLASS } from './format.ts';
import { Panel } from './kit.tsx';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </div>
  );
}

/** A flag that is green when `ok` and red otherwise. */
function Indicator({ testId, ok, okText, badText }: { testId: string; ok: boolean; okText: string; badText: string }) {
  return (
    <span data-testid={testId} data-ok={ok} className={`font-medium ${ok ? 'text-emerald-600' : 'text-red-500'}`}>
      {ok ? okText : badText}
    </span>
  );
}

/** Score bar with the threshold mark (the score runs 0…1). */
function Gauge() {
  const verdict = useAppStore((s) => s.model.lastScored);
  const threshold = useAppStore((s) => s.model.threshold);
  const score = verdict?.score ?? null;
  const over = score !== null && score > threshold;
  return (
    <div className="py-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400" title="Last scored window">
          RCF score / threshold
        </span>
        <span data-testid="rcf-gauge" className={`font-mono tabular-nums ${over ? 'text-red-500' : ''}`}>
          {formatGauge(score, verdict?.threshold ?? threshold)}
        </span>
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
        <progress
          max={1}
          value={score ?? 0}
          className={`absolute inset-0 h-2 w-full appearance-none [&::-webkit-progress-bar]:bg-transparent ${over ? '[&::-webkit-progress-value]:bg-red-500' : '[&::-webkit-progress-value]:bg-sky-500'}`}
        />
      </div>
    </div>
  );
}

/** The M3 panel at the top of the right column. */
export function StatusPanel() {
  const snap = useAppStore((s) => s.sim.snapshot);
  const dominant = useAppStore((s) => s.model.lastScored?.dominant ?? null);
  const state = snap?.state ?? 'OFF';
  const tone = STATE_TONE[state];
  return (
    <Panel title="Status (M3)" testId="status-panel">
      <div className="mb-2">
        <span
          data-testid="status-badge"
          data-tone={tone}
          className={`rounded px-3 py-1 text-sm font-bold tracking-wide ${TONE_CLASS[tone]}`}
        >
          {state}
        </span>
      </div>
      <Gauge />
      <Row label="Dominant variable">
        <span data-testid="dominant-var" className="font-mono">
          {dominant ?? '—'}
        </span>
      </Row>
      <Row label="Persistence (alerts / to trip)">
        <span data-testid="persistence" className="font-mono tabular-nums">
          {persistenceText(snap?.alertRun ?? 0, snap?.nCritical ?? 0)}
        </span>
      </Row>
      <Row label="Relay">
        <span data-testid="relay-state" className="font-mono">
          {relayText(snap?.contact ?? 'NC')}
        </span>
      </Row>
      <Row label="Fan speed">
        <span data-testid="rpm-readout" className="font-mono tabular-nums">
          {Math.round(snap?.rpm ?? 0)} rpm
        </span>
      </Row>
      <Row label="Wi-Fi link">
        <Indicator testId="link-indicator" ok={!snap?.linkLost} okText="OK" badText="link lost" />
      </Row>
      <Row label="DS18B20">
        <Indicator testId="sensor-indicator" ok={!snap?.sensorFault} okText="OK" badText="sensor fault" />
      </Row>
      <Row label="Trip reason">
        <span data-testid="trip-reason" className="font-mono font-semibold">
          {snap?.tripReason ?? '—'}
        </span>
      </Row>
    </Panel>
  );
}
