import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_API_URL } from './e2e/support/backend-url';

// Config E2E del workspace frontend-react.
// Documentación completa: https://playwright.dev/docs/test-configuration

// Minimal .env loader — `dotenv` is not a direct dependency of this workspace,
// and Vite's own .env handling does not apply to a bare `playwright test` run.
// Ported from `playwright.api.config.ts:11-25`.
//
// No spec reads `process.env.API_URL` any more: api-health.spec.ts resolves the
// backend from `e2e/support/backend-url.ts` like every other spec does. What this
// loader still does is carry the REST of a developer's `frontend-react/.env` into
// `process.env`, from where `ambientEnv()` forwards it to the dev server Playwright
// spawns. `API_URL` itself is overridden explicitly in `webServer.env` below.
function loadEnv(path: string) {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return; // No .env: existing env vars (or none at all) are used as-is.
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
//
// A developer's `frontend-react/.env` is their own dev configuration: read from,
// never written to, copied, or overwritten. Nothing in the E2E suite depends on a
// particular key being present there — an absent `.env` is a supported state.
loadEnv(resolve(__dirname, '.env'));

// The backend every E2E spec targets. Defined in `e2e/support/backend-url.ts`
// so specs never have to import this config module to reach it — see the
// rationale there.

// `webServer.env` must carry the rest of the ambient environment too — the
// spawned `pnpm dev` (turbo -> vite) process needs PATH and friends, not just
// API_URL. `process.env` types values as `string | undefined`; Playwright's
// `env` wants `Record<string, string>`, so undefined entries are dropped.
function ambientEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export default defineConfig({
  // Los tests viven en e2e/ en la raíz del workspace, junto a esta config.
  testDir: './e2e',

  // Corre cada test en un worker propio para aprovechar el paralelismo local.
  fullyParallel: true,

  // En CI falla si queda un `.only` olvidado; localmente no aplica.
  forbidOnly: !!process.env.CI,

  // Borra las filas `e2e-*` que la suite deja en la BD, una sola vez, cuando
  // ya no queda ningún worker corriendo. Va acá y no por spec a propósito:
  // con `fullyParallel` un borrado per-spec eliminaría filas vivas de los
  // specs que siguen corriendo (mismo peligro que el `ResetDataAsync` de la
  // suite .NET, README.md:103). Ver e2e/support/global-teardown.ts.
  globalTeardown: './e2e/support/global-teardown.ts',

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
  //
  // ⚠️ TRAMPA: si ya había un dev server en :3333 levantado A MANO antes de correr
  // Playwright, `reuseExistingServer: true` lo reutiliza tal cual está — el `API_URL`
  // que se inyecta acá abajo NUNCA llega a ese proceso. La suite de registro
  // (e2e/register.spec.ts, e2e/register-rate-limit.spec.ts) detecta esto en runtime
  // vía el guard de e2e/support/network-observer.ts, que falla con un mensaje
  // accionable en vez de escribir filas reales en el backend equivocado.
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3333',
    reuseExistingServer: true,
    timeout: 120_000,
    // `API_URL` (consumido por turbo -> vite -> import.meta.env, ver design.md)
    // pisa lo que hubiera en el `.env` del dev server recién levantado — pero
    // solo si Playwright efectivamente levanta el proceso (ver trampa arriba).
    env: { ...ambientEnv(), API_URL: E2E_API_URL },
  },

  // Solo Chromium (ya descargado en la caché de Playwright).
  // Para sumar otro navegador: añadir entrada aquí y correr `pnpm exec playwright install <browser>`.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
