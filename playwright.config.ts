import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e', timeout: 90000, workers: 1,
  use: { baseURL: 'http://localhost:3217' },
  webServer: { command: 'node dist/server/index.js', port: 3217, env: { PORT: '3217', E2E: '1' }, reuseExistingServer: false },
});
