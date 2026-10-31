// pnpm gen:fixtures — regenerates tests/fixtures/*.
// P3.2: five feature windows captured from the plant (healthy, imbalance, looseness, friction, sensor-null). Each
// fixture holds the raw window, the calibrated counts0, the valid DS18B20 readings and the config values the
// features use; `python3 -I scripts/features_reference.py` then fills in the NumPy `reference`.
// P4.6: rcf_dataset.json — 120 healthy training windows and 60 test windows (healthy and the four faults) from the
// harness; `python3 -I scripts/rrcf_reference.py` then fills in the Python rrcf scores.
// P8.3: session_s2.jsonl — the S2 run (default model) as the bridge logs it: packets up, verdicts down, one line per
// message with the bridge clock in t_ms. `pnpm gen:fixtures -- --only=session` writes just this one.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addTempReading, createTempTracker } from '../src/firmware/features.ts';
import { runScenario } from '../src/harness/runScenario.ts';
import { configFeatures, featureVector } from '../src/rcf/model.ts';
import { createSampler, samplerTick } from '../src/firmware/sampler.ts';
import { CONFIG } from '../src/shared/config.ts';
import type { FaultKey } from '../src/shared/messages.ts';
import { type Scenario, scenarioById } from '../src/shared/scenarios.ts';
import { createPlant, runPlant, schedule } from '../src/sim/plant.ts';
import { GPIO_HIGH, GPIO_LOW } from '../src/sim/types.ts';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null;
const outDir = resolve(args.find((a) => !a.startsWith('--')) ?? join(import.meta.dirname, '../tests/fixtures'));
const CAPTURE_WINDOW = 20; // steady state: well past spin-up and with ≥ 10 readings for dT/dt

const CASES: { name: string; key: FaultKey | null; value: number | boolean }[] = [
  { name: 'healthy', key: null, value: 0 },
  { name: 'imbalance', key: 'imbalance_g', value: 0.3 },
  { name: 'looseness', key: 'looseness', value: 0.6 },
  { name: 'friction', key: 'friction', value: 0.5 },
  { name: 'sensor-null', key: 'ds18b20Disconnect', value: true },
];

/** Runs one case with a minimal firmware (calibrate with the relay open, then fan on) and captures one window. */
function capture(c: (typeof CASES)[number]) {
  const plant = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
  if (c.key) schedule(plant, { at_s: 0, kind: 'fault', key: c.key, value: c.value, ramp_s: 0 });
  const sampler = createSampler(CONFIG);
  const temps = createTempTracker();
  let calSum = 0;
  let calN = 0;
  let out: object | null = null;
  runPlant(
    plant,
    {
      tick(view) {
        const calibrating = view.t_s < CONFIG.firmware.calib_s;
        if (calibrating) {
          calSum += view.adcCounts;
          calN++;
        }
        const s = samplerTick(sampler, view);
        if (s.dsRead) addTempReading(temps, s.dsRead, CONFIG);
        if (s.window?.index === CAPTURE_WINDOW) {
          const w = s.window;
          const lsb = (a: Float64Array) => Array.from(a.subarray(0, w.n), (x) => Math.round(x * CONFIG.sensors.mpu.lsbPerG)); // prettier-ignore
          out = {
            name: c.name,
            now_s: w.tEnd_s,
            counts0: calSum / calN,
            window: {
              ax_lsb: lsb(w.ax_g),
              ay_lsb: lsb(w.ay_g),
              az_lsb: lsb(w.az_g),
              counts: Array.from(w.counts.subarray(0, w.n)),
              edges: w.edges,
            },
            temps: temps.history.map((r) => [r.t_s, r.value_C]),
            config: {
              lsbPerG: CONFIG.sensors.mpu.lsbPerG,
              vSpan_V: CONFIG.sensors.adc.vSpan_V,
              maxCount: CONFIG.sensors.adc.maxCount,
              rTop_ohm: CONFIG.sensors.divider.rTop_ohm,
              rBottom_ohm: CONFIG.sensors.divider.rBottom_ohm,
              sens_VperA: CONFIG.sensors.acs712.sens_VperA,
              tachPulsesPerRev: CONFIG.fan.tachPulsesPerRev,
              window_s: CONFIG.firmware.window_s,
              dtdtSpan_s: CONFIG.firmware.dtdtSpan_s,
              dtdtMinSamples: CONFIG.firmware.dtdtMinSamples,
            },
            reference: null,
          };
        }
        return calibrating ? GPIO_HIGH : GPIO_LOW;
      },
    },
    CAPTURE_WINDOW + 1.001,
  );
  if (!out) throw new Error(`window ${CAPTURE_WINDOW} not captured for ${c.name}`);
  return out;
}

// rcf_dataset (P4.6): train on healthy windows 16…135, test on healthy 136…155 and 10 windows after each fault onset.
const DATASET_FAULTS: { label: string; key: FaultKey; value: number }[] = [
  { label: 'imbalance', key: 'imbalance_g', value: 0.3 },
  { label: 'looseness', key: 'looseness', value: 0.6 },
  { label: 'friction', key: 'friction', value: 0.3 }, // below I_SOFT, so the windows stay NORMAL
  { label: 'overheat', key: 'overheat', value: 1.0 },
];
const FAULT_AT_S = 60;
const FAULT_WINDOWS = 10;

/** NORMAL/WARNING windows with no null feature from a harness run (no RCF scoring), keyed by window index. */
function windows(steps: Scenario['steps'], end_s: number): Map<number, number[]> {
  const scenario: Scenario = { id: 'dataset', title: 'rcf dataset', guided: false, end_s, steps };
  const { packets } = runScenario(scenario, { seed: CONFIG.seed, config: CONFIG, model: null });
  const out = new Map<number, number[]>();
  for (const p of packets) {
    const x = featureVector(p, configFeatures(CONFIG));
    if (x && (p.state === 'NORMAL' || p.state === 'WARNING')) out.set(p.seq, x);
  }
  return out;
}

function rcfDataset() {
  const start: Scenario['steps'][number] = { at_s: 0, action: { kind: 'command', cmd: 'START' } };
  const range = (from: number, n: number) => Array.from({ length: n }, (_, k) => from + k);
  const healthy = windows([start], 160);
  const pick = (m: Map<number, number[]>, seqs: number[]) => seqs.map((k) => m.get(k) ?? [] /* checked below */);
  const train = pick(healthy, range(16, CONFIG.rcf.nTrain));
  const test = pick(healthy, range(16 + CONFIG.rcf.nTrain, 20)).map((row) => ({ label: 'healthy', row }));
  for (const f of DATASET_FAULTS) {
    const fault = { at_s: FAULT_AT_S, action: { kind: 'fault' as const, key: f.key, value: f.value, ramp_s: 0 } };
    const w = windows([start, fault], FAULT_AT_S + FAULT_WINDOWS + 2);
    test.push(...pick(w, range(FAULT_AT_S + 1, FAULT_WINDOWS)).map((row) => ({ label: f.label, row })));
  }
  if ([...train, ...test.map((t) => t.row)].some((r) => r.length === 0)) throw new Error('rcf_dataset: missing window');
  return {
    name: 'rcf_dataset',
    seed: CONFIG.seed,
    numTrees: CONFIG.rcf.numTrees,
    features: configFeatures(CONFIG),
    stdFloor: CONFIG.rcf.features.map((k) => CONFIG.rcf.stdFloor[k as keyof typeof CONFIG.rcf.stdFloor]),
    train,
    test,
    reference: null,
  };
}

/** S2 with the default model as bridge JSON lines: each packet at its window end, its verdict 1 ms later. */
function sessionS2(): string {
  const model = JSON.parse(readFileSync(join(import.meta.dirname, '../public/models/default-model.json'), 'utf8'));
  const { packets, verdicts } = runScenario(scenarioById('S2'), { seed: CONFIG.seed, config: CONFIG, model });
  const lines = [
    ...packets.map((p) => ({ t_ms: p.ts_ms, dir: 'up', msg: p })),
    ...verdicts.map((v) => ({ t_ms: Math.round(v.sent_s * 1000) + 1, dir: 'down', msg: v.verdict })),
  ].sort((a, b) => a.t_ms - b.t_ms);
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

mkdirSync(outDir, { recursive: true });
const sessionFile = join(outDir, 'session_s2.jsonl');
writeFileSync(sessionFile, sessionS2());
process.stdout.write(`wrote ${sessionFile}\n`);
if (only === 'session') process.exit(0);
for (const c of CASES) {
  const file = join(outDir, `features_${c.name}.json`);
  writeFileSync(file, `${JSON.stringify(capture(c))}\n`);
  process.stdout.write(`wrote ${file}\n`);
}
const datasetFile = join(outDir, 'rcf_dataset.json');
writeFileSync(datasetFile, `${JSON.stringify(rcfDataset())}\n`);
process.stdout.write(`wrote ${datasetFile}\n`);
process.stdout.write('next: python3 -I scripts/features_reference.py (fills the NumPy reference)\n');
process.stdout.write('next: python3 -I scripts/rrcf_reference.py (fills the Python rrcf scores)\n');
