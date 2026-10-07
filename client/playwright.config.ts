import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';

const root = resolve(__dirname, '..');
const appVersion = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/.test(appVersion)) {
  throw new Error('VERSION must contain a software version, for example 0.1.0.');
}
const testCourses = resolve(root, '.run', 'e2e-courses');
mkdirSync(testCourses, { recursive: true });
cpSync(resolve(root, 'courses'), testCourses, { recursive: true });
cpSync(resolve(__dirname, 'e2e/fixtures/courses'), testCourses, { recursive: true });
const testDatabase =
  process.env['DINO_E2E_DATABASE_PATH'] || resolve(root, '.run', `e2e-${Date.now()}.sqlite`);
process.env['DINO_E2E_DATABASE_PATH'] = testDatabase;

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
      command: `go -C lms build -ldflags="-X github.com/andreyfesunov/dino_lms/lms/internal/buildinfo.Version=${appVersion}" -o ../.run/web-e2e.exe ./cmd/web && .run\\web-e2e.exe`,
      cwd: root,
      url: 'http://127.0.0.1:8081/api/bootstrap',
      env: {
        DINO_SERVER__ADDR: '127.0.0.1:8081',
        DINO_DATABASE__PATH: testDatabase,
        DINO_COURSES__DIR: testCourses,
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
