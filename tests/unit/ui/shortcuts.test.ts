import { describe, expect, it } from 'vitest';
import { GLOSSARY, SHORTCUTS, shortcutFor, WIRE_KEY } from '../../../src/ui/legend.ts';

describe('M12 legend data and keyboard shortcuts (§8.2, §13.3, §14)', () => {
  it('maps Space, S, E, R, 1–5 and ? to their actions', () => {
    expect(shortcutFor(' ')).toEqual({ kind: 'togglePlay' });
    expect(shortcutFor('s')).toEqual({ kind: 'start' });
    expect(shortcutFor('S')).toEqual({ kind: 'start' });
    expect(shortcutFor('e')).toEqual({ kind: 'estop' });
    expect(shortcutFor('r')).toEqual({ kind: 'reset' });
    expect(shortcutFor('1')).toEqual({ kind: 'camera', preset: 'overview' });
    expect(shortcutFor('5')).toEqual({ kind: 'camera', preset: 'breadboard' });
    expect(shortcutFor('?')).toEqual({ kind: 'help' });
    expect(shortcutFor('Escape')).toEqual({ kind: 'close' });
    expect(shortcutFor('x')).toBeNull();
    expect(SHORTCUTS.map((s) => s.keys)).toEqual(['Space', 'S', 'E', 'R', '1–5', '?', 'Esc']);
  });

  it('lists all 11 wire colours of §13.3 and every §14 term', () => {
    expect(WIRE_KEY.map((w) => w.meaning)).toEqual(['12 V', 'GND', '5 V', '3V3', 'SDA', 'SCL', '1-Wire', 'analog', 'tach', 'relay control', 'USB, barrel cable']); // prettier-ignore
    expect(GLOSSARY.map((g) => g.term)).toEqual(['a_RMS', 'Crest factor (CF)', 'I_RMS', 'dT/dt', 'RCF / RRCF', 'CoDisp', 'Dominant variable', 'NO / NC', 'Persistence', 'Latched']); // prettier-ignore
  });
});
