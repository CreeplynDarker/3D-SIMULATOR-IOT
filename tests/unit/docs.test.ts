import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const docs = resolve(import.meta.dirname, '../../docs');
const read = (name: string) => readFileSync(resolve(docs, name), 'utf8');

/** Task IDs declared in PLAN.md §11, e.g. `**P2.4 Sensors.**` or `**P5.G Phase gate**`. */
function planTaskIds(plan: string): string[] {
  const start = plan.indexOf('## 11. Phases and tasks');
  const end = plan.indexOf('\n## 12.', start);
  const section = plan.slice(start, end);
  return [...section.matchAll(/\*\*(P\d+\.(?:\d+|G))\b/g)].map((m) => m[1] ?? '');
}

describe('docs', () => {
  it('PROGRESS.md and DECISIONS.md exist', () => {
    expect(existsSync(resolve(docs, 'PROGRESS.md'))).toBe(true);
    expect(existsSync(resolve(docs, 'DECISIONS.md'))).toBe(true);
  });

  it('every task ID in PLAN.md §11 appears in PROGRESS.md', () => {
    const ids = planTaskIds(read('PLAN.md'));
    expect(ids.length).toBeGreaterThanOrEqual(50);
    const progress = read('PROGRESS.md');
    const listed = new Set([...progress.matchAll(/^- \[[ ~x]\] (P\d+\.(?:\d+|G))\s/gm)].map((m) => m[1]));
    const missing = ids.filter((id) => !listed.has(id));
    expect(missing).toEqual([]);
  });
});

describe('README (P7.3)', () => {
  const readme = readFileSync(join(import.meta.dirname, '../../README.md'), 'utf8');

  it('links screenshots that exist, and the commands that run and test the app', () => {
    const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1] as string);
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const img of images) expect(existsSync(join(import.meta.dirname, '../..', img)), img).toBe(true);
    for (const cmd of ['pnpm install --frozen-lockfile', 'pnpm dev', 'pnpm verify', 'pnpm test:e2e'])
      expect(readme).toContain(cmd);
    expect(readme).toMatch(/https:\/\/creeplyndarker\.github\.io\/3D-SIMULATOR-IOT\//);
  });
});
