import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../../src/harness/runScenario.ts';
import { trainDefault } from '../../../src/harness/trainDefault.ts';
import { parseModelJson, serialiseModel } from '../../../src/rcf/model.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import { Packet, Verdict } from '../../../src/shared/protocol.ts';
import { type Scenario, SCENARIOS, scenarioById } from '../../../src/shared/scenarios.ts';

const MODEL_TEXT = readFileSync(join(import.meta.dirname, '../../../public/models/default-model.json'), 'utf8');
const MODEL = parseModelJson(MODEL_TEXT);

/** A short imbalance run: START at 0, imbalance 0.3 at 20 s, end at 40 s. */
const SHORT: Scenario = {
  id: 'short',
  title: 'short imbalance',
  guided: false,
  end_s: 40,
  steps: [
    { at_s: 0, action: { kind: 'command', cmd: 'START' } },
    { at_s: 20, action: { kind: 'fault', key: 'imbalance_g', value: 0.3, ramp_s: 0 } },
  ],
};
const opts = { seed: CONFIG.seed, config: CONFIG, model: MODEL };

describe('harness (§10.4)', () => {
  const a = runScenario(SHORT, opts);

  it('two runs with the same seed and script give byte-identical JSON', () => {
    const b = runScenario(SHORT, opts);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const other = runScenario(SHORT, { ...opts, seed: CONFIG.seed + 1 });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(a));
  });

  it('one valid packet per window, each answered by a valid verdict delivered through the link', () => {
    expect(a.packets).toHaveLength(40);
    for (const p of a.packets) expect(Packet.safeParse(p).success).toBe(true);
    expect(a.verdicts.map((v) => v.verdict.seq_ref)).toEqual(a.packets.map((p) => p.seq));
    // The verdict for the last window is still in flight when the run ends.
    expect(a.verdicts.at(-1)?.delivered_s).toBeNull();
    for (const v of a.verdicts.slice(0, -1)) {
      expect(Verdict.safeParse(v.verdict).success).toBe(true);
      // §7.5: delivered at window end + 20 ± 10 ms (0.5 ms step resolution).
      const delay_s = (v.delivered_s ?? Infinity) - v.sent_s;
      expect(delay_s).toBeGreaterThanOrEqual(0.01 - 1e-9);
      expect(delay_s).toBeLessThanOrEqual(0.0305);
    }
    // Packets before NORMAL are unscored; NORMAL/WARNING ones are scored by the model.
    expect(a.verdicts.filter((v) => v.verdict.score === null).length).toBe(a.packets.filter((p) => !['NORMAL', 'WARNING'].includes(p.state)).length); // prettier-ignore
  });

  it('records events, logs and a per-second timeline', () => {
    const types = a.events.map((e) => e.type);
    for (const t of [
      'START',
      'CALIBRATED',
      'RELAY_CLOSED',
      'NORMAL',
      'FAULT_SET',
      'ALERT',
      'WARNING',
      'CRITICAL',
      'RELAY_OPEN',
    ]) {
      expect(types).toContain(t);
    }
    expect(a.events.map((e) => e.t_s)).toEqual([...a.events.map((e) => e.t_s)].sort((x, y) => x - y));
    expect(a.logs.some((l) => /ERR fsm: trip RCF a_rms=/.test(l))).toBe(true);
    expect(a.timeline.map((row) => row.t_s)).toEqual(Array.from({ length: 41 }, (_, k) => k));
    expect(a.timeline[0]).toMatchObject({ state: 'OFF', contact: 'NC', rpm: 0 });
  });

  it('without a model every verdict is unscored and the firmware never leaves NORMAL', () => {
    const r = runScenario(SHORT, { ...opts, model: null });
    expect(r.verdicts.every((v) => v.verdict.score === null && v.verdict.model === 'UNTRAINED')).toBe(true);
    expect(r.packets.at(-1)?.state).toBe('NORMAL');
    expect(r.events.some((e) => e.type === 'LINK_LOST')).toBe(false);
  });

  it('schedules steps relative to the first CRITICAL and ends there when asked', () => {
    const rel: Scenario = {
      ...SHORT,
      end_s: 100,
      endAfterCritical_s: 3,
      steps: [...SHORT.steps, { at_s: 1, after: 'CRITICAL', action: { kind: 'command', cmd: 'START' } }],
    };
    const r = runScenario(rel, opts);
    const tCrit = r.events.find((e) => e.type === 'CRITICAL')?.t_s ?? NaN;
    expect(r.events.find((e) => e.type === 'REFUSED')?.t_s).toBeCloseTo(tCrit + 1, 6);
    expect(r.timeline.at(-1)?.t_s).toBe(Math.floor(tCrit + 3));
  });
});

describe('scenarios (§12)', () => {
  it('lists S1–S9 with START at t = 0 and the guided flags of §12', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);
    for (const s of SCENARIOS) expect(s.steps[0]).toEqual({ at_s: 0, action: { kind: 'command', cmd: 'START' } });
    expect(SCENARIOS.filter((s) => s.guided).map((s) => s.id)).toEqual(['S1', 'S2', 'S4', 'S5', 'S6', 'S9']);
    expect(scenarioById('S9')).toMatchObject({ end_s: 600, speed: 10 });
    expect(() => scenarioById('S0')).toThrow();
  });
});

describe('default model (§9.4)', () => {
  it('public/models/default-model.json is what trainDefault() produces now', () => {
    const result = trainDefault(CONFIG);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(serialiseModel(result.model)).toBe(MODEL_TEXT.trim());
    expect(MODEL).toMatchObject({ seed: CONFIG.seed, nTrain: CONFIG.rcf.nTrain, numTrees: CONFIG.rcf.numTrees });
    expect(MODEL.holdoutMax).toBeLessThan(CONFIG.rcf.holdoutMaxRatio * CONFIG.rcf.threshold);
  });
});
