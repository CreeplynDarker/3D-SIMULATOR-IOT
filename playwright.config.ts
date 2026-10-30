import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: Boolean(process.env['CI']),
  reporter: 'list',
  // Every page renders WebGL; running one at a time keeps frame times (and worker round trips) representative.
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    {
      name: 'chromium',
      // Full Chromium in new-headless mode uses the machine's GPU; the default headless shell falls back to
      // SwiftShader software rendering.
      use: { ...devices['Desktop Chrome'], channel: 'chromium', launchOptions: { args: ['--ignore-gpu-blocklist'] } },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
