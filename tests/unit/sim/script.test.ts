import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { scenarioById } from '../../../src/shared/scenarios.ts';
import { createPlant } from '../../../src/sim/plant.ts';
import { scriptDone, scriptEvent, startScript } from '../../../src/sim/script.ts';

const plant = () => createPlant(CONFIG, CONFIG.seed, { warmStart: true });

describe('scenario script (§12, D-042)', () => {
  it('schedules the absolute steps at the current sim time plus their offset', () => {
    const p = plant();
    const run = startScript(p, scenarioById('S6'), 12);
    expect(p.actions.map((a) => [a.at_s, a.kind])).toEqual([
      [12, 'command'],
      [42, 'fault'],
      [72, 'fault'],
    ]);
    expect(run.end_s).toBe(12 + 420);
    expect(scriptDone(run, 431.9)).toBe(false);
    expect(scriptDone(run, 432)).toBe(true);
  });

  it('times the `after: CRITICAL` steps from the first CRITICAL and ends at endAfterCritical_s', () => {
    const p = plant();
    const run = startScript(p, scenarioById('S8'), 0);
    expect(p.actions).toHaveLength(2);
    scriptEvent(run, p, { t_s: 30, type: 'WARNING' });
    expect(p.actions).toHaveLength(2);
    scriptEvent(run, p, { t_s: 65, type: 'CRITICAL' });
    expect(p.actions.slice(2).map((a) => [a.at_s, a.kind])).toEqual([[66, 'command'], [70, 'clearFaults'], [85, 'command'], [86, 'command']]); // prettier-ignore
    expect(run.critical_s).toBe(65);
    expect(run.end_s).toBe(110);
    // a second CRITICAL schedules nothing more
    scriptEvent(run, p, { t_s: 90, type: 'CRITICAL' });
    expect(p.actions).toHaveLength(6);
    expect(run.end_s).toBe(110);
  });
});
