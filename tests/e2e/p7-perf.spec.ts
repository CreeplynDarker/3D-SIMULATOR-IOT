import { expect, test } from '@playwright/test';

// P7.2: renderer counters at the overview preset with every view toggle on and the fan running, against the numbers
// measured before P7.2 (D-066): 208 draw calls, 58,408 vertices, 20,391,936 texture bytes.
test('P7.2: instancing, Points pulses and smaller textures cut draw calls, vertices and texture bytes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 5 && window.__scene?.texturesReady() === true && window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 }); // prettier-ignore
  for (const t of ['airflow', 'heat'] as const) await page.getByTestId(`tgl-${t}`).click();
  await page.getByTestId('sel-speed').selectOption('4');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => window.__sim?.state === 'NORMAL', undefined, { timeout: 60_000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => window.__scene?.info());
  process.stdout.write(`PERF ${JSON.stringify(info)}\n`);
  expect(info?.calls ?? Infinity).toBeLessThan(208);
  expect(info?.vertices ?? Infinity).toBeLessThan(58_408);
  expect(info?.textureBytes ?? Infinity).toBeLessThan(20_391_936);
});
