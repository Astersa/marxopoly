import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e', timeout: 90000, workers: 1,
  use: { baseURL: 'http://localhost:3217', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } },
  webServer: { command: 'node dist/server/index.js', port: 3217, env: { PORT: '3217', E2E: '1' }, reuseExistingServer: false },
});
