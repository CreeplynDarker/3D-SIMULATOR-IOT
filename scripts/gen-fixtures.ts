// pnpm gen:fixtures — regenerates tests/fixtures/*.
// P3.2: five feature windows captured from the plant (healthy, imbalance, looseness, friction, sensor-null). Each
// fixture holds the raw window, the calibrated counts0, the valid DS18B20 readings and the config values the
// features use; `python3 -I scripts/features_reference.py` then fills in the NumPy `reference`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addTempReading, createTempTracker } from '../src/firmware/features.ts';
import { createSampler, samplerTick } from '../src/firmware/sampler.ts';
import { CONFIG } from '../src/shared/config.ts';
import type { FaultKey } from '../src/shared/messages.ts';
import { createPlant, runPlant, schedule } from '../src/sim/plant.ts';
import { GPIO_HIGH, GPIO_LOW } from '../src/sim/types.ts';

const outDir = resolve(process.argv[2] ?? join(import.meta.dirname, '../tests/fixtures'));
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

mkdirSync(outDir, { recursive: true });
for (const c of CASES) {
  const file = join(outDir, `features_${c.name}.json`);
  writeFileSync(file, `${JSON.stringify(capture(c))}\n`);
  process.stdout.write(`wrote ${file}\n`);
}
process.stdout.write('next: python3 -I scripts/features_reference.py (fills the NumPy reference)\n');
