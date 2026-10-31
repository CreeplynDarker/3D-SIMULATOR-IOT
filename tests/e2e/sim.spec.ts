import { expect, type Page, test } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm?.snapshot() !== null);
  // The clock is read on the main thread; without a GPU the 3D render loop would starve it (D-068).
  await page.evaluate(() => window.__pdm?.setRendering(false));
}

/** Sim seconds per wall second over `wall_ms`, measured inside the page; also returns the lagging flag. */
async function rate(page: Page, wall_ms: number) {
  return page.evaluate(async (ms) => {
    const api = window.__pdm;
    if (!api) throw new Error('debug API missing');
    const a = api.snapshot();
    const w0 = performance.now();
    await new Promise((r) => setTimeout(r, ms));
    const b = api.snapshot();
    const w1 = performance.now();
    if (!a || !b) throw new Error('no snapshot');
    return { perWall: (b.t_s - a.t_s) / ((w1 - w0) / 1000), lagging: b.lagging };
  }, wall_ms);
}

test('at 10× the sim clock advances 10 ± 0.5 s per wall second, or reports lagging', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.__pdm?.setSpeed(10);
    window.__pdm?.play();
  });
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.t_s ?? 0) > 1);
  const r = await rate(page, 3000);
  if (!r.lagging) expect(Math.abs(r.perWall - 10)).toBeLessThanOrEqual(0.5);
});

test('at 1× the sim clock follows the wall clock', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__pdm?.play());
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.t_s ?? 0) > 0.2);
  const r = await rate(page, 2000);
  expect(r.lagging).toBe(false);
  expect(Math.abs(r.perWall - 1)).toBeLessThanOrEqual(0.05);
});

test('pause stops the clock', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.__pdm?.setSpeed(4);
    window.__pdm?.play();
  });
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.t_s ?? 0) > 1);
  await page.evaluate(() => window.__pdm?.pause());
  await page.waitForTimeout(200); // let the last snapshot arrive
  const r = await rate(page, 1000);
  expect(r.perWall).toBe(0);
});

test('START powers the fan through the relay', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.__pdm?.setSpeed(4);
    window.__pdm?.play();
    window.__pdm?.command('START');
  });
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.rpm ?? 0) > 3000, undefined, { timeout: 10_000 });
  const s = await page.evaluate(() => window.__pdm?.snapshot());
  expect(s?.contact).toBe('NO');
  expect(s?.gpio26).toBe(0);
});
