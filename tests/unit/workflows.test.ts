// P7.4: the GitHub Actions workflows publish to Pages from main and check pull requests, with every action pinned.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(join(import.meta.dirname, '../../.github/workflows', name), 'utf8');
const DEPLOY = read('deploy.yml');
const CI = read('ci.yml');

describe('GitHub Actions workflows (P7.4)', () => {
  it('pin every action to a full commit SHA, with its exact version alongside', () => {
    for (const [name, yml] of [
      ['deploy.yml', DEPLOY],
      ['ci.yml', CI],
    ] as const) {
      const uses = yml.match(/uses: .+/g) ?? [];
      expect(uses.length, name).toBeGreaterThan(2);
      for (const u of uses) expect(u, name).toMatch(/^uses: [\w-]+\/[\w-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it('deploy: on push to main, install from the lockfile, build, upload dist/ and deploy to Pages', () => {
    expect(DEPLOY).toMatch(/on:\s*\n\s+push:\s*\n\s+branches: \[main\]/);
    expect(DEPLOY).toContain('pnpm install --frozen-lockfile');
    expect(DEPLOY).toContain('pnpm build');
    expect(DEPLOY).toMatch(/actions\/upload-pages-artifact@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+path: dist/);
    expect(DEPLOY).toMatch(/actions\/deploy-pages@/);
    expect(DEPLOY).toMatch(/pages: write/);
    expect(DEPLOY).toMatch(/id-token: write/);
  });

  it('ci: on pull requests, run pnpm verify and pnpm test:e2e', () => {
    expect(CI).toMatch(/on:\s*\n\s+pull_request:/);
    expect(CI).toContain('pnpm verify');
    expect(CI).toContain('pnpm test:e2e');
    expect(CI).toContain('pnpm install --frozen-lockfile');
  });
});
