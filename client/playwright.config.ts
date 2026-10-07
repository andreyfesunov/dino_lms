import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://localhost:4201',
    channel: 'msedge',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'go -C lms build -o ../.run/web-e2e.exe ./cmd/web && .run\\web-e2e.exe',
      cwd: root,
      url: 'http://127.0.0.1:8081/api/bootstrap',
      env: {
        DINO_SERVER__ADDR: '127.0.0.1:8081',
        DINO_DATABASE__PATH: resolve(root, '.run', `e2e-${Date.now()}.sqlite`),
        DINO_COURSES__DIR: resolve(root, 'courses'),
      },
      timeout: 120000,
    },
    {
      command: 'npm.cmd start -- --host localhost --port 4201 --proxy-config proxy.e2e.conf.json',
      cwd: __dirname,
      url: 'http://localhost:4201',
      timeout: 120000,
    },
  ],
});
