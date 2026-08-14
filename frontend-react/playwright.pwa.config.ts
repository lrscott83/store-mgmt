import { defineConfig } from '@playwright/test';

// Config E2E dedicado del OFFLINE SHELL (service worker real).
//
// Por qué existe como config aparte y no dentro de `playwright.config.ts`:
//
// 1. El config general sirve el DEV server (`pnpm dev`), donde vite-plugin-pwa
//    registra un worker SIN precache (`globPatterns: []`, design.md D10). Un
//    test de shell offline contra dev probaría un SW vacío — no el que sirve
//    el `index.html` precacheado que es exactamente el comportamiento en
//    producción. Este config levanta `vite preview`, que sirve el BUILD
//    (`build/client/`) con el `service-worker.js` real y su manifest completo
//    inyectado por `scripts/build-sw.mjs`.
//
// 2. El config general BLOQUEA service workers (`serviceWorkers: 'block'`)
//    para que las respuestas cacheadas del SW de dev no contaminen los specs
//    que prueban la red real. El test de offline-shell existe para ejercitar
//    JUSTO ese worker, así que aquí no se bloquea (default: 'allow').
//
// 3. No requiere backend: el shell precacheado renderiza `/login` sin ninguna
//    llamada de red (SPA mode, guestOnlyLoader sin sesión). Por eso este config
//    NO tiene globalSetup/globalTeardown (que conectan a Postgres) — un
//    desarrollo local sin backend puede correr este test igual.
//
// CÓMO CORRER (desde frontend-react/):
//   pnpm --filter @store-mgmt/web-store-pos build   # una vez, genera build/client con el SW real
//   npx playwright test --config=playwright.pwa.config.ts
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/offline-shell.spec.ts',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  use: {
    // vite.config.ts `preview.port` (MUST differ from the dev 3333 — a
    // service worker's scope is its origin, see vite.config.ts:112-121).
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // Service workers ALLOWED: this is the whole point of the test. Do not
    // inherit `serviceWorkers: 'block'` from the general config.
  },

  // Levanta el BUILD con `vite preview` (puerto 4173) y espera a que responda.
  webServer: {
    command: 'pnpm --filter @store-mgmt/web-store-pos exec vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },

  projects: [{ name: 'chromium', use: {} }],
});
