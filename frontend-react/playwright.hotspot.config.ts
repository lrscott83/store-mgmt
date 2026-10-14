import { defineConfig } from '@playwright/test';

// Dedicated config for the hotspot loopback spec.
//
// It deliberately has NO `webServer`, NO `globalSetup` and NO backend: the spec
// spins up its own two browser contexts and drives the real WebRTC engine
// directly (bundled from `apps/web-store-pos/app/sync/lib/hotspot/`). That is
// what makes it runnable without the app's dev server, auth or database.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/hotspot-transfer.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { browserName: 'chromium' },
});
