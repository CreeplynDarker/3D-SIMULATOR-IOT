import { expect, type Page, test } from '@playwright/test';

const active = (page: Page) => page.getByTestId('code-panel').locator('[data-active="true"]');
const state = (page: Page, s: string) => page.waitForFunction((x) => window.__sim?.state === x, s, { timeout: 90_000 });

test('P6.5: in each state the active line in M8 carries the expected @map id', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__pdm?.setRendering(false)); // logic only: no software-WebGL load (D-077)
  await page.getByTestId('dock-tab-code').click();
  for (const id of ['code-panel', 'tab-code-firmware', 'tab-code-schema', 'tab-code-rcf', 'tgl-follow']) await expect(page.getByTestId(id), id).toBeVisible(); // prettier-ignore
  await expect(active(page)).toHaveCount(0); // OFF at boot: nothing has run yet
  await page.getByTestId('sel-speed').selectOption('0.25'); // CALIBRATING lasts 0.5 s of sim time
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await state(page, 'CALIBRATING');
  await expect(active(page)).toHaveAttribute('data-map', 'sm.off.start');
  await expect(page.getByTestId('code-panel')).toHaveAttribute('data-file', 'state_machine.cpp');
  // The highlighted line's text carries its own marker (read in one go: CALIBRATING may end meanwhile)
  const line = await active(page).evaluate((el) => ({ map: el.getAttribute('data-map'), text: el.textContent ?? '' }));
  expect(line.text).toContain(`// @map ${line.map}`);
  await state(page, 'STARTING');
  await expect(active(page)).toHaveAttribute('data-map', 'sm.calib.done');
  await page.getByTestId('sel-speed').selectOption('4');
  await state(page, 'NORMAL');
  await expect(active(page)).toHaveAttribute('data-map', 'sm.start.done');
  await page.getByTestId('sel-speed').selectOption('1'); // WARNING lasts 4 windows
  await page.getByTestId('sld-imbalance').fill('0.3');
  await state(page, 'WARNING');
  await expect(active(page)).toHaveAttribute('data-map', /^sm\.(normal|warn)\.alert$/);
  await page.getByTestId('sel-speed').selectOption('4');
  await state(page, 'CRITICAL');
  await expect(active(page)).toHaveAttribute('data-map', 'sm.warn.trip');
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.rpm ?? 1e9) < 100, undefined, { timeout: 60_000 });
  await page.getByTestId('btn-reset').click();
  await page.getByTestId('btn-reset-confirm').click();
  await state(page, 'OFF');
  await expect(active(page)).toHaveAttribute('data-map', 'sm.reset.ok');
});

test('P6.5: tabs show the protocol and RCF sources; with follow off the view stays put', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__pdm?.setRendering(false)); // logic only: no software-WebGL load (D-077)
  await page.getByTestId('dock-tab-code').click();
  await page.getByTestId('tab-code-schema').click();
  await expect(page.getByTestId('code-panel')).toHaveAttribute('data-file', 'protocol.ts');
  await expect(page.getByTestId('code-panel')).toContainText('PROTOCOL_VERSION');
  await page.getByTestId('tab-code-rcf').click();
  await expect(page.getByTestId('code-panel')).toHaveAttribute('data-file', 'model.ts');
  await expect(page.getByTestId('code-panel').locator('.text-violet-600').first()).toBeVisible(); // keywords coloured
  await page.getByTestId('tgl-follow').click();
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => (window.__sim?.state ?? 'OFF') !== 'OFF', undefined, { timeout: 60_000 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId('code-panel')).toHaveAttribute('data-file', 'model.ts');
  await page.getByTestId('tgl-follow').click();
  await expect(page.getByTestId('code-panel')).toHaveAttribute(
    'data-file',
    /^(state_machine|relay|main|features)\.cpp$/,
  );
  await expect(active(page)).toHaveCount(1);
});
