import { defineConfig, devices } from '@playwright/test';

// slowMo makes the recorded walkthrough watchable; it's off in CI.
const slowMo = process.env.E2E_SLOMO ? Number(process.env.E2E_SLOMO) : 0;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { slowMo },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  // Bring the web app up automatically. Locally it reuses a dev server if one
  // is already running; the API on :4000 is expected to be up separately.
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : {
        command: 'npm run start',
        url: 'http://localhost:3000',
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
