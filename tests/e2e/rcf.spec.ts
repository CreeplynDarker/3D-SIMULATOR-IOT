import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm !== undefined);
});

test('the RCF worker loads default-model.json at boot (model status READY)', async ({ page }) => {
  // The `model-status` element arrives with M5 (P5.5); until then the store's model slice is what it will show.
  await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY');
  expect(await page.evaluate(() => window.__pdm?.modelStatus())).toEqual({
    status: 'READY',
    progress: 1,
    reason: null,
  });
});

test('returns a scored verdict for each packet within 20 ms of wall time', async ({ page }) => {
  await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY');
  // Latency is measured on the main thread; stop the 3D render loop so a GPU-less runner measures the RCF (D-068).
  await page.evaluate(() => window.__pdm?.setRendering(false));
  await page.evaluate(() => {
    window.__pdm?.setSpeed(10);
    window.__pdm?.command('START');
    window.__pdm?.play();
  });
  // 40 sim seconds: calibration, grace, then ~29 scored NORMAL windows.
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.t_s ?? 0) > 40, undefined, { timeout: 20_000 });
  const r = await page.evaluate(() => {
    const api = window.__pdm;
    if (!api) throw new Error('debug API missing');
    return { packets: api.simPackets(), verdicts: api.rcfVerdicts(), latency: api.verdictLatencies_ms() };
  });
  expect(r.verdicts.length).toBeGreaterThanOrEqual(r.packets.length - 1);
  expect(r.verdicts.map((v) => v.seq_ref)).toEqual(r.packets.slice(0, r.verdicts.length).map((p) => p.seq));
  const scored = r.verdicts.filter((v) => v.score !== null);
  expect(scored.length).toBeGreaterThan(20);
  expect(scored.every((v) => v.model === 'READY' && v.alert === false)).toBe(true);
  // Every verdict whose packet copy has also reached main has a latency.
  expect(r.latency.length).toBeGreaterThanOrEqual(r.verdicts.length - 1);
  for (const ms of r.latency) expect(ms).toBeLessThan(20);
});
