import { defineConfig, devices } from '@playwright/test';

// Config E2E del workspace frontend-react.
// Documentación completa: https://playwright.dev/docs/test-configuration

export default defineConfig({
  // Los tests viven en e2e/ en la raíz del workspace, junto a esta config.
  testDir: './e2e',

  // Corre cada test en un worker propio para aprovechar el paralelismo local.
  fullyParallel: true,

  // En CI falla si queda un `.only` olvidado; localmente no aplica.
  forbidOnly: !!process.env.CI,

  // En CI reintenta tests fallidos (2 veces); localmente 0 para iterar rápido.
  retries: process.env.CI ? 2 : 0,

  // En CI un solo worker (dev servers no dan para más); localmente todos los CPUs disponibles.
  workers: process.env.CI ? 1 : undefined,

  // Reporte HTML para revisar a mano tras correr; `open: 'never'` para no abrir el navegador solo.
  reporter: [['html', { open: 'never' }]],

  use: {
    // La app SPA corre en este puerto en dev (hardcodeado en apps/web-store-pos/vite.config.ts).
    baseURL: 'http://localhost:3333',
    // Guarda un trace (film de la sesión) solo al reintentar un test que falló.
    trace: 'on-first-retry',
    // vite-plugin-pwa (devOptions.enabled) registra un service worker que cachea respuestas en dev.
    // Lo bloqueamos para no obtener respuestas cacheadas falsas durante los tests.
    contextOptions: { serviceWorkers: 'block' },
  },

  // Levanta el dev server automáticamente con `pnpm dev` (turbo) y espera a que el puerto responda.
  // `reuseExistingServer: true` → si ya hay un server en 3333, lo reutiliza en vez de levantar otro.
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3333',
    reuseExistingServer: true,
    timeout: 120_000,
  },

  // Solo Chromium (ya descargado en la caché de Playwright).
  // Para sumar otro navegador: añadir entrada aquí y correr `pnpm exec playwright install <browser>`.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
