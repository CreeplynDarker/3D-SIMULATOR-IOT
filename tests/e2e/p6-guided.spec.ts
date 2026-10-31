import { expect, type Page, test } from '@playwright/test';

async function open(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 });
}
const card = (page: Page) => page.getByTestId('scenario-card');

// P6 accept: every guided scenario runs to its last step with scenarioDone = true.
for (const id of ['S1', 'S2', 'S4', 'S5', 'S6', 'S9']) {
  test(`M11: guided ${id} runs to its last step with scenarioDone`, async ({ page }) => {
    test.setTimeout(300_000);
    await open(page);
    const t0 = Date.now();
    await page.getByTestId('sel-scenario').selectOption(id);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-step', '1');
    const steps = Number(await card(page).getAttribute('data-steps'));
    const seen = new Set<string>(['1']); // step 1 was seen just above; at 10× it can be over before the first sample
    while (!(await page.evaluate(() => window.__sim?.scenarioDone === true))) {
      seen.add((await card(page).getAttribute('data-step')) ?? '');
      await page.waitForTimeout(250);
    }
    const wall_s = (Date.now() - t0) / 1000;
    process.stdout.write(`GUIDED ${id} steps=${steps} seen=${[...seen].join(',')} wall=${wall_s.toFixed(1)}s\n`);
    await expect(card(page)).toHaveAttribute('data-step', String(steps));
    await expect(card(page)).toHaveAttribute('data-reached', String(steps));
    // Steps go by themselves; at 10× on a slow runner short ones can pass between two 250 ms samples, so this only
    // checks that several were seen. Reaching the last step (above) is the real check.
    expect(seen.size).toBeGreaterThanOrEqual(3);
    const ui = (await page.evaluate(() => window.__pdm?.inspect().ui))!;
    expect(ui.camera).toBe('overview');
    expect(ui.guidedChart).toBe('chart-score');
    await expect(page.getByTestId('chart-score')).toHaveAttribute('data-watched', 'true');
  });
}

test('M11: Back and Next revisit steps with their camera and chart; Exit closes the card', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId('sel-scenario').selectOption('S2');
  await page.getByTestId('btn-play').click(); // hold at the start
  for (const id of ['scenario-card', 'btn-scn-next', 'btn-scn-back', 'btn-scn-exit']) await expect(page.getByTestId(id), id).toBeVisible(); // prettier-ignore
  await expect(page.getByTestId('btn-scn-back')).toBeDisabled();
  await page.getByTestId('btn-scn-next').click();
  await page.getByTestId('btn-scn-next').click();
  await expect(card(page)).toHaveAttribute('data-step', '3');
  await expect(card(page)).toContainText('Imbalance injected');
  expect((await page.evaluate(() => window.__pdm?.inspect().ui))?.camera).toBe('fan');
  expect((await page.evaluate(() => window.__pdm?.inspect().ui))?.guidedChart).toBe('chart-arms');
  await page.getByTestId('btn-scn-back').click();
  await expect(card(page)).toHaveAttribute('data-step', '2');
  await page.getByTestId('btn-scn-exit').click();
  await expect(card(page)).toBeHidden();
  expect((await page.evaluate(() => window.__pdm?.inspect().ui))?.guidedChart).toBeNull();
});
