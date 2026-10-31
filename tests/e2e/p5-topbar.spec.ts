import { expect, type Page, test } from '@playwright/test';

const IDS = ['sim-clock', 'fps', 'mode-label', 'btn-play', 'sel-speed', 'btn-sim-reset', 'sel-scenario', 'sel-mode', 'btn-theme', 'btn-help']; // prettier-ignore

async function open(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
}
const view = (page: Page) => page.evaluate(() => window.__pdm?.inspect());

test('M2: every test ID exists and is visible', async ({ page }) => {
  await open(page);
  for (const id of IDS) await expect(page.getByTestId(id), id).toBeVisible();
  await expect(page.getByTestId('sel-mode')).toBeEnabled(); // §8.2: disabled until P8
  await expect(page.getByTestId('sim-clock')).toHaveText(/^\d{2}:\d{2}\.\d$/);
});

test('M2: play/pause, speed, sim reset, theme and help change the store', async ({ page }) => {
  await open(page);
  await page.getByTestId('btn-play').click();
  expect((await view(page))?.sim.playing).toBe(true);
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('sel-speed').selectOption('4');
  expect((await view(page))?.sim.speed).toBe(4);
  await page.waitForFunction(() => (window.__sim?.t_s ?? 0) > 1);
  await page.getByTestId('btn-play').click();
  expect((await view(page))?.sim.playing).toBe(false);
  await expect(page.getByTestId('sim-clock')).not.toHaveText('00:00.0');
  await page.getByTestId('btn-sim-reset').click();
  await expect(page.getByTestId('sim-clock')).toHaveText('00:00.0');
  const theme = (await view(page))?.ui.theme;
  await page.getByTestId('btn-theme').click();
  expect((await view(page))?.ui.theme).not.toBe(theme);
  await page.getByTestId('btn-help').click();
  expect((await view(page))?.ui.legendOpen).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__sim?.fps ?? 0)).toBeGreaterThan(0);
  await expect(page.getByTestId('fps')).toHaveText(/\d+ fps/);
});

test('sel-scenario plays a §12 script: S2 imbalance trips and ends with scenarioDone', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId('sel-speed').selectOption('10');
  await page.getByTestId('sel-scenario').selectOption('S2');
  expect((await view(page))?.sim.scenario).toEqual({ id: 'S2', done: false });
  await page.waitForFunction(() => window.__sim?.scenarioDone === true, undefined, { timeout: 100_000 });
  const sim = await page.evaluate(() => ({
    state: window.__sim?.state,
    t_s: window.__sim?.t_s,
    last: window.__sim?.lastEvent,
  }));
  expect(sim.state).toBe('CRITICAL');
  expect(sim.t_s).toBeGreaterThanOrEqual(120);
  expect(sim.t_s).toBeLessThan(121);
  expect((await view(page))?.sim.playing).toBe(false);
  const events = await page.evaluate(() => window.__pdm?.events() ?? []);
  const crit = events.find((e) => e.type === 'CRITICAL');
  expect(crit?.t_s ?? Infinity).toBeLessThanOrEqual(70);
  expect(events.some((e) => e.type === 'FAULT_SET' && Math.abs(e.t_s - 60) < 0.01)).toBe(true);
});
