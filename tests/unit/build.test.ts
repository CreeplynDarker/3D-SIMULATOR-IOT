import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

const outDir = mkdtempSync(join(tmpdir(), 'pdm-build-'));

describe('pnpm build', () => {
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('writes index.html', { timeout: 120_000 }, async () => {
    await build({
      root: resolve(import.meta.dirname, '../..'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
  });
});
