import { expect, type Page, test } from '@playwright/test';

const IDS = ['model-status', 'latched-indicator', 'btn-start', 'btn-estop', 'btn-reset', 'btn-train', 'tgl-warm-start', 'inp-threshold', 'inp-n-critical', 'inp-i-max', 'inp-t-max']; // prettier-ignore

async function open(page: Page, play = true) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
  await page.evaluate(() => window.__pdm?.setRendering(false)); // logic only: no software-WebGL load (D-077)
  await page.getByTestId('sel-speed').selectOption('4');
  if (play) await page.getByTestId('btn-play').click();
}
const state = (page: Page, s: string, timeout = 60_000) =>
  page.waitForFunction((x) => window.__sim?.state === x, s, { timeout });

test('M5: every control exists; READY at boot; start only in OFF, reset only in CRITICAL', async ({ page }) => {
  await open(page);
  for (const id of IDS) await expect(page.getByTestId(id), id).toBeVisible();
  await expect(page.getByTestId('model-status')).toHaveText('READY');
  await expect(page.getByTestId('btn-start')).toBeEnabled();
  await expect(page.getByTestId('btn-reset')).toBeDisabled();
  await expect(page.getByTestId('btn-train')).toBeDisabled();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('btn-start')).toBeDisabled();
  await state(page, 'NORMAL');
  await page.getByTestId('btn-estop').click();
  await state(page, 'CRITICAL');
  await expect(page.getByTestId('latched-indicator')).toHaveText('LATCHED');
  await expect(page.getByTestId('btn-reset')).toBeEnabled();
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.rpm ?? 1e9) < 100, undefined, { timeout: 60_000 });
  await page.getByTestId('btn-reset').click();
  await expect(page.getByTestId('dlg-reset-confirm')).toBeVisible();
  await page.getByTestId('btn-reset-confirm').click();
  await expect(page.getByTestId('dlg-reset-confirm')).toBeHidden();
  await state(page, 'OFF');
  await expect(page.getByTestId('latched-indicator')).toHaveText('—');
  await expect(page.getByTestId('btn-start')).toBeEnabled();
});

test('M5: btn-train needs NORMAL with no fault, then reports TRAINING n/180', async ({ page }) => {
  // START before play: a warm-started motor left OFF cools, and |dT/dt| > warmDtdtMax keeps TRAIN disabled.
  await open(page, false);
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await state(page, 'NORMAL');
  await expect(page.getByTestId('btn-train')).toBeEnabled({ timeout: 10_000 });
  // Any active fault disables it; packet loss leaves the temperature alone, so clearing it re-enables at once.
  await page.getByTestId('sld-loss').fill('0.1');
  await expect(page.getByTestId('btn-train')).toBeDisabled();
  await page.getByTestId('btn-clear-faults').click();
  await expect(page.getByTestId('btn-train')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('btn-train').click();
  await expect(page.getByTestId('model-status')).toHaveText(/^TRAINING \d+\/180$/);
  await expect(page.getByTestId('model-status')).not.toHaveText('TRAINING 0/180', { timeout: 15_000 });
});

test('M5: threshold, nCritical and T_MAX inputs reach the RCF and the firmware', async ({ page }) => {
  await open(page);
  await page.getByTestId('inp-threshold').fill('0.6');
  await page.getByTestId('inp-n-critical').fill('7');
  await page.getByTestId('inp-i-max').fill('0.35');
  const view = await page.evaluate(() => window.__pdm?.inspect());
  expect(view?.model.threshold).toBe(0.6);
  expect(view?.operator).toMatchObject({ nCritical: 7, iMax_A: 0.35 });
  await expect(page.getByTestId('persistence')).toHaveText('0/7');
  await page.getByTestId('btn-start').click();
  await state(page, 'NORMAL');
  await page.waitForFunction(() => window.__pdm?.rcfVerdicts().some((v) => v.score !== null && v.threshold === 0.6));
  // A T_MAX below the warm-start temperature (34 °C) trips at the next window.
  await page.getByTestId('inp-t-max').fill('30');
  await state(page, 'CRITICAL', 20_000);
  await expect(page.getByTestId('trip-reason')).toHaveText('T_MAX');
});

test('M5: tgl-warm-start applies at the next sim reset', async ({ page }) => {
  await open(page);
  expect((await page.evaluate(() => window.__pdm?.inspect()))?.operator.warmStart).toBe(true);
  await page.getByTestId('tgl-warm-start').click();
  expect((await page.evaluate(() => window.__pdm?.inspect()))?.operator.warmStart).toBe(false);
  await page.getByTestId('btn-sim-reset').click();
  await page.waitForFunction(() => Math.abs((window.__pdm?.snapshot()?.tMotor_C ?? 0) - 25) < 0.01);
});
