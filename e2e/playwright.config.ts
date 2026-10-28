import { defineConfig, devices } from '@playwright/test';

// Browser tests against a running SpareSlot with the demo seed and DEMO_LOGIN_ENABLED=true.
//   BASE_URL=http://localhost:3000 npx playwright test
// PW_CHANNEL=msedge (or chrome) uses an installed browser instead of downloading Playwright's Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: './tests',
  // the journey tests share one database, so they run one after another
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel }, testIgnore: /responsive.spec.ts/ },
    { name: 'phone', use: { ...devices['Pixel 5'], channel }, testMatch: /responsive\.spec\.ts/ },
  ],
});
