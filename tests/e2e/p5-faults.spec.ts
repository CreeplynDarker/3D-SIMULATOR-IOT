import { expect, type Page, test } from '@playwright/test';

const SLIDERS = [
  ['sld-imbalance', 'imbalance_g'],
  ['sld-looseness', 'looseness'],
  ['sld-friction', 'friction'],
  ['sld-overheat', 'overheat'],
  ['sld-sag', 'supplySag_V'],
  ['sld-loss', 'packetLoss'],
] as const;

async function open(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
  await page.evaluate(() => window.__pdm?.play());
}
const faults = (page: Page) => page.evaluate(() => window.__pdm?.inspect().faults);

test('M4: every control exists, with the §5.1 slider ranges', async ({ page }) => {
  await open(page);
  for (const [id] of SLIDERS) await expect(page.getByTestId(id), id).toBeVisible();
  for (const id of ['tgl-ds-disconnect', 'tgl-ramp', 'inp-ramp-s', 'btn-clear-faults']) await expect(page.getByTestId(id), id).toBeVisible(); // prettier-ignore
  await expect(page.getByTestId('sld-imbalance')).toHaveAttribute('max', '0.5');
  await expect(page.getByTestId('sld-sag')).toHaveAttribute('max', '3');
  await expect(page.getByTestId('sld-loss')).toHaveAttribute('step', '0.05');
});

test('M4: sliders step faults into the plant and show the live value; clear zeroes them', async ({ page }) => {
  await open(page);
  for (const [id, key] of SLIDERS) {
    await page.getByTestId(id).fill('0.3');
    await expect.poll(async () => (await faults(page))?.live?.[key]).toBeCloseTo(0.3, 6);
    expect((await faults(page))?.targets[key]).toBeCloseTo(0.3, 6);
    await expect(page.getByTestId(`val-${id.slice(4)}`)).toHaveText(/0\.30/);
  }
  await page.getByTestId('tgl-ds-disconnect').click();
  await expect.poll(async () => (await faults(page))?.live?.ds18b20Disconnect).toBe(true);
  await page.getByTestId('btn-clear-faults').click();
  await expect.poll(async () => (await faults(page))?.live).toEqual({ imbalance_g: 0, looseness: 0, friction: 0, overheat: 0, supplySag_V: 0, packetLoss: 0, ds18b20Disconnect: false }); // prettier-ignore
  expect((await faults(page))?.targets.imbalance_g).toBe(0);
});

test('M4: with tgl-ramp on, a fault ramps over inp-ramp-s seconds of sim time', async ({ page }) => {
  await open(page);
  await page.getByTestId('tgl-ramp').click();
  await page.getByTestId('inp-ramp-s').fill('20');
  expect((await faults(page))?.ramp).toEqual({ on: true, ramp_s: 20 });
  const t0 = await page.evaluate(() => window.__sim?.t_s ?? 0);
  await page.getByTestId('sld-friction').fill('0.5');
  await page.waitForFunction((t) => (window.__sim?.t_s ?? 0) > t + 2, t0);
  const mid = (await faults(page))?.live?.friction ?? -1;
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(0.5);
});
