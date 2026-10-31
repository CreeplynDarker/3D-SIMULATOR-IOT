import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const fwDir = join(root, 'src/firmware');
const cppDir = join(fwDir, 'reference-cpp');

/** Every `// @map <id>` marker in the files of `dir` with extension `ext`, one entry per occurrence. */
function markers(dir: string, ext: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/\/\/ @map ([a-z0-9.]+)/g)].map((m) => m[1] ?? ''));
}

/** The id list in PLAN.md §7.6. */
function specIds(): string[] {
  const plan = readFileSync(join(root, 'docs/PLAN.md'), 'utf8');
  const section = plan.slice(plan.indexOf('### 7.6'), plan.indexOf('### 7.7'));
  const list = section.slice(section.indexOf('IDs:'), section.indexOf('The firmware sets'));
  // the ids sit in one backtick span that wraps across lines: match each dotted id
  return [...list.matchAll(/[a-z]+(?:\.[a-z0-9]+)+/g)].map((m) => m[0]);
}

const count = (ids: string[]) => ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());

describe('@map markers (§7.6)', () => {
  const ts = markers(fwDir, '.ts');
  const cpp = markers(cppDir, '.cpp');

  it('the TS firmware carries exactly the §7.6 ids, once each', () => {
    expect(specIds()).toHaveLength(24);
    expect([...new Set(ts)].sort()).toEqual([...specIds()].sort());
    expect([...count(ts)].filter(([, n]) => n !== 1)).toEqual([]);
  });

  it('every TS id appears exactly once in reference-cpp/', () => {
    const c = count(cpp);
    expect(ts.filter((id) => c.get(id) !== 1)).toEqual([]);
  });

  it('every reference-cpp id exists in the TS firmware', () => {
    const t = new Set(ts);
    expect(cpp.filter((id) => !t.has(id))).toEqual([]);
  });

  it('ships the four reference files', () => {
    expect(readdirSync(cppDir).sort()).toEqual(['features.cpp', 'main.cpp', 'relay.cpp', 'state_machine.cpp']);
  });
});
