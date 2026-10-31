import { describe, expect, it } from 'vitest';
import { createAppStore } from '../../../src/store/index.ts';
import { NO_FAULTS } from '../../../src/store/slices/ui.ts';
import { conditionText, runPatch, testlogCsv } from '../../../src/ui/testlog.ts';

describe('M10 test log (§8.2)', () => {
  it('names the condition after the scenario, or the injected faults', () => {
    expect(conditionText('S2', NO_FAULTS)).toBe('S2');
    expect(conditionText(null, NO_FAULTS)).toBe('manual: no fault');
    expect(conditionText(null, { ...NO_FAULTS, imbalance_g: 0.3, ds18b20Disconnect: true })).toBe(
      'manual: imbalance_g=0.3, ds18b20Disconnect',
    );
  });

  it('fills alerted, time to first alert, CRITICAL → relay open and reset from the events', () => {
    const store = createAppStore();
    const t = () => store.getState().testlog;
    const id = t().startRun('S2', 10);
    const apply = (e: Parameters<typeof runPatch>[1]) => {
      const run = t().runs.find((r) => r.id === id);
      if (run) t().updateRun(id, runPatch(run, e));
    };
    apply({ t_s: 50, type: 'NORMAL' });
    expect(t().runs[0]).toMatchObject({ alerted: false, firstAlert_s: null });
    apply({ t_s: 71.03, type: 'ALERT' });
    apply({ t_s: 72.03, type: 'ALERT' });
    apply({ t_s: 75.013, type: 'CRITICAL' });
    apply({ t_s: 75.018, type: 'RELAY_OPEN' });
    apply({ t_s: 95, type: 'RESET' });
    t().stopRun(id, 100);
    expect(t().runs[0]).toMatchObject({ alerted: true, resetByOperator: true, duration_s: 90 });
    expect(t().runs[0]?.firstAlert_s).toBeCloseTo(61.03, 6);
    expect(t().runs[0]?.criticalToRelay_ms).toBeCloseTo(5, 6);
    expect(t().active).toBeNull();
  });

  it('exports the table as CSV', () => {
    const store = createAppStore();
    const id = store.getState().testlog.startRun('manual: friction=0.5', 0);
    store.getState().testlog.updateRun(id, { notes: 'loud, "hot"' });
    const csv = testlogCsv(store.getState().testlog.runs).trimEnd().split('\n');
    expect(csv[0]).toBe(
      'scenario,start_s,duration_s,alerted,first_alert_s,critical_to_relay_ms,reset_by_operator,notes',
    );
    expect(csv[1]).toBe('manual: friction=0.5,0.0,,n,,,n,"loud, ""hot"""');
  });
});
