import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

// Config for API connectivity checks. Deliberately separate from
// `playwright.config.ts`: no `webServer` and no browser project, because whether
// the backend answers must not depend on the frontend dev server building.

// Minimal .env loader — `dotenv` is not a direct dependency of this workspace,
// and Vite's own .env handling does not apply to a bare `playwright test` run.
//
// api-health.spec.ts no longer reads `API_URL` from here: it resolves the backend
// from `e2e/support/backend-url.ts`, so this config needs no `.env` key to run.
// The loader stays because a developer's other `.env` values remain available to
// anything added under this config later.
function loadEnv(path: string) {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return; // No .env: an absent file is a supported state, not an error.
  }
  for (const line of contents.split('\n')) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue; // A real env var always wins.
    process.env[key] = (match[2] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

// This config is loaded as CommonJS by Playwright, so `__dirname` is available
// and `import.meta` is not.
loadEnv(resolve(__dirname, '.env'));

export default defineConfig({
  testDir: './e2e',
  testMatch: /api-.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  use: {
    // The API runs on the ASP.NET dev HTTPS port with a self-signed development
    // certificate. Without this, every request fails on certificate validation
    // instead of on whatever the test is actually checking.
    ignoreHTTPSErrors: true,
  },
});
