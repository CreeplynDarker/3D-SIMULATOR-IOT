// P7.3 copy check: the M12 glossary is §14, and the help, tooltip and guided text use the project's vocabulary.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDED } from '../../../src/shared/guided.ts';
import { COMPONENTS } from '../../../src/shared/components.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import { createPlant, toSnapshot } from '../../../src/sim/plant.ts';
import { inspectorFor } from '../../../src/ui/inspectorData.ts';
import { GLOSSARY, SHORTCUTS } from '../../../src/ui/legend.ts';

const ROOT = join(import.meta.dirname, '../../..');
const PLAN = readFileSync(join(ROOT, 'docs/PLAN.md'), 'utf8');

/** §14 as { term, text }, markdown removed. */
function planGlossary() {
  const section = PLAN.slice(PLAN.indexOf('## 14. Glossary'));
  return section
    .split('\n- **')
    .slice(1)
    .map((entry) => {
      const [term, ...rest] = entry.split('**: ');
      return {
        term: term as string,
        text: rest
          .join('**: ')
          .replace(/\s*\n\s*/g, ' ')
          .replace(/`/g, '')
          .trim(),
      };
    });
}

const SNAP = toSnapshot(createPlant(CONFIG, CONFIG.seed, { warmStart: true }));
/** Name, specs and pin lines M9 shows for a part. */
function specText(id: (typeof COMPONENTS)[number]['id']): string[] {
  const info = inspectorFor(id, SNAP, null);
  return [info.name, ...info.specs, ...info.pins.map((p) => p.text)];
}
const GUIDED_TEXT = GUIDED.flatMap((g) => g.steps.flatMap((s) => [s.title, s.watch, s.injected, s.meaning]));
const UI_FILES = ['src/ui', 'src/scene'].flatMap((d) =>
  readdirSync(join(ROOT, d), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => join(d, f)),
);

describe('copy and vocabulary (P7.3)', () => {
  it('the M12 glossary is §14, term for term and word for word', () => {
    const plan = planGlossary();
    expect(plan.length).toBe(10);
    expect(GLOSSARY.map((g) => g.term)).toEqual(plan.map((g) => g.term));
    GLOSSARY.forEach((g, i) => expect(g.text, g.term).toBe(plan[i]?.text));
  });

  it('upper-case tokens in guided and help text are real states, commands, limits, pins or parts', () => {
    const known = new Set(
      'HIGH LOW OFF CALIBRATING STARTING NORMAL WARNING CRITICAL START RESET ESTOP E-STOP RCF RRCF T_MAX I_MAX T_SOFT I_SOFT SENSOR STALL GPIO26 GPIO27 GPIO34 GPIO4 CH1 CH2 COM2 NC NO NC2 NO2 W04 ESP32 RPM DS18B20 MPU6050 ACS712 LED RMS I_RMS CF ESC SPACE'.split(' '), // prettier-ignore
    );
    const text = [...GUIDED_TEXT, ...SHORTCUTS.map((s) => s.action), ...GLOSSARY.map((g) => g.text)].join(' ');
    const unknown = [...new Set(text.match(/\b[A-Z][A-Z0-9_-]{1,}\b/g) ?? [])].filter((w) => !known.has(w));
    expect(unknown).toEqual([]);
  });

  it('feature names in guided text are the protocol keys or the §14 names', () => {
    // protocol feature keys and packet flags, and the §14 display names
    const keys = new Set(['a_rms_g', 'cf', 'i_rms_A', 't_C', 'dtdt_C_per_min', 'rpm', 'link_lost', 'sensor_fault', 'a_RMS', 'I_RMS']); // prettier-ignore
    const snake = [...new Set(GUIDED_TEXT.join(' ').match(/\b[a-z]+(?:_[a-zA-Z]+)+\b/g) ?? [])];
    expect(snake.filter((w) => !keys.has(w))).toEqual([]);
  });

  it('no UI file names the detector wrongly', () => {
    for (const f of UI_FILES) {
      // comments are for developers; only code (and the strings in it) is checked
      const src = readFileSync(join(ROOT, f), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(src, f).not.toMatch(/isolation forest|(?<!cut )random forest\b/i);
    }
  });

  it('displayed text data carries no markdown (backticks or **bold**)', () => {
    const shown = [...GUIDED_TEXT, ...GLOSSARY.flatMap((g) => [g.term, g.text]), ...SHORTCUTS.map((s) => s.action), ...COMPONENTS.flatMap((c) => specText(c.id))]; // prettier-ignore
    expect(shown.filter((t) => /`|\*\*/.test(t))).toEqual([]);
  });
});
