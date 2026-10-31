import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const SESSION = join(import.meta.dirname, '../fixtures/session_s2.jsonl'); // S2 as the bridge logs it (gen:fixtures)

test('P8.3: a bridge session replays through the Live path at 10×; pause freezes it; a bad file is refused', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 });
  await page.getByTestId('sel-mode').selectOption('replay');
  await expect(page.getByTestId('mode-label')).toHaveText('Replay');
  await expect(page.getByTestId('sld-imbalance')).toBeDisabled();
  await expect(page.getByTestId('btn-start')).toBeDisabled();
  await expect(page.getByTestId('btn-play')).toBeEnabled();
  await page.getByTestId('sel-speed').selectOption('10');

  await page.getByTestId('inp-replay-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello\n') }); // prettier-ignore
  await expect(page.getByTestId('replay-status')).toContainText('no packets in this file');

  await page.getByTestId('inp-replay-file').setInputFiles(SESSION);
  const status = page.getByTestId('replay-status');
  await expect(status).toContainText('session_s2.jsonl');
  await expect(page.getByTestId('status-badge')).toHaveText('NORMAL', { timeout: 15_000 });
  await expect(page.getByTestId('persistence')).toHaveText('—/5');

  await page.getByTestId('btn-play').click(); // pause: nothing more is fed
  await expect(page.getByTestId('btn-play')).toHaveText('Play');
  const frozen = await status.textContent();
  const clock = await page.getByTestId('sim-clock').textContent();
  await page.waitForTimeout(1500);
  expect(await status.textContent()).toBe(frozen);
  expect(await page.getByTestId('sim-clock').textContent()).toBe(clock);
  await page.getByTestId('btn-play').click();

  // The browser's RCF worker scores the replayed packets again: the dominant variable is its own verdict's.
  await expect(page.getByTestId('status-badge')).toHaveText('CRITICAL', { timeout: 20_000 });
  await expect(page.getByTestId('trip-reason')).toHaveText('RCF');
  await expect(page.getByTestId('dominant-var')).toHaveText('a_rms_g');
  await expect(status).toHaveAttribute('data-done', 'true', { timeout: 20_000 });
  await expect(status).toContainText('120/120 packets · done');
  await expect(page.getByTestId('btn-play')).toHaveText('Play');
  const verdicts = await page.evaluate(() => window.__pdm?.inspect().console.verdicts ?? 0);
  expect(verdicts).toBeGreaterThan(100);

  await page.getByTestId('sel-mode').selectOption('sim');
  await expect(status).toBeHidden();
  await expect(page.getByTestId('mode-label')).toHaveText('Simulation');
});
