import { defineConfig } from '@playwright/test';
import { E2E_API_URL } from './e2e/support/backend-url';

// `webServer.env` REPLACES the spawned process's environment (Playwright:
// "process.env by default" — the default only applies when `env` is unset).
// The preview process needs PATH and friends to run at all, and vite.config.ts
// reads E2E_API_URL (for the preview '/api' proxy target) from ITS process
// env — so the ambient environment must be carried through, same shape as
// playwright.config.ts's `ambientEnv()`.
function ambientEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

// Config E2E dedicada de las EXPORT PATHS bajo CSP ENFORCING (Step 2 del plan
// docs/plans/2026-09-10-csp-enforcing-flip-plan.md).
//
// Por qué existe como config aparte — mismos tres motivos que
// playwright.pwa.config.ts, más uno:
//
// 1. El config general sirve el DEV server, cuyo payload de hidratación
//    inline NO es el que sirve producción (la entrada KNOWN_DEV_ONLY_
//    VIOLATIONS existe por eso). Bajo CSP enforcing el dev hydration se
//    BLOQUEA y la app nunca hidrata: fallaría por un motivo que no existe en
//    producción. Este config sirve el BUILD real con `vite preview`.
//
// 2. El config general BLOQUEA service workers; acá no importan, pero el
//    default ('allow') está bien: el build sirve el SW real, que bajo
//    worker-src 'self' está cubierto.
//
// 3. Necesita backend real + globalSetup/globalTeardown (los flujos de export
//    necesitan sesión y datos), a diferencia del config PWA que no los usa.
//
// 4. El header lo inyecta `csp-enforcing-preview-header` en
//    apps/web-store-pos/vite.config.ts (activado por E2E_CSP_ENFORCE=1),
//    computado del MISMO csp-policy.mjs que verify-csp compara contra
//    nginx.conf — el spec puede asertar que el header recibido ES el valor
//    canónico, así el test se autoverifica.
//
// CÓMO CORRER (desde frontend-react/):
//   pnpm --filter @store-mgmt/web-store-pos build   # build real primero
//   npx playwright test --config=playwright.csp.config.ts
export default defineConfig({
  testDir: './e2e',
  // Solo el spec nuevo de export paths bajo enforcing. csp-report-only.spec.ts
  // pertenece al config general (dev server): no lo toques acá.
  testMatch: '**/csp-enforcing-*.spec.ts',

  // La sesión se mintea con UNA persona por worker — serial evita que dos
  // workers compitan por el mismo registro contra el backend.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],

  use: {
    // apps/web-store-pos/vite.config.ts no define preview.port por config de
    // este config — el comando de abajo pasa --port 4174 explícito. Debe
    // diferir del 4173 del config PWA: el scope de un SW es su origen, y un
    // origin compartido haría que el SW del config PWA controle estas
    // páginas (mismo peligro documentado en vite.config.ts preview.port).
    baseURL: 'http://localhost:4174',
    trace: 'on-first-retry',
    // Service workers BLOCKED — same rationale as playwright.config.ts:115
    // ("no obtener respuestas cacheadas falsas durante los tests"), applied
    // here for the persona mint: the build serves the REAL precache SW (168
    // entries racing the mint's register/login navigations). Precedent:
    // sync-export-import-v2.spec.ts:234 blocks SWs per-context for the same
    // isolation reason. The SW is ORTHOGONAL to what this spec proves — the
    // CSP enforcing header (test 1), zip.js (no SW involvement) and
    // jspdf/html2canvas (no SW involvement) are all exercised without it.
    // worker-src 'self' remains verified by the header assertion itself.
    contextOptions: { serviceWorkers: 'block' },
  },

  // El dev-server-guard del config general no aplica: ese guard verifica que
  // el DEV server (3333) apunte al backend correcto; acá el server es el
  // preview del build y su /api sale del proxy de abajo. Mantenemos
  // globalSetup SOLO si hay algo que verificar — por ahora nada: el backend
  // se verifica solo cuando el propio spec mintea la persona (un backend
  // caído falla el login, mensaje claro).

  // globalTeardown del config general (sweep de filas e2e-*): los specs de
  // export mintean usuarios e2e-*, así que el sweep aplica igual.
  globalTeardown: './e2e/support/global-teardown.ts',

  // Levanta `vite preview` sobre el build con E2E_CSP_ENFORCE=1, puerto 4174.
  // reuseExistingServer: false A PROPÓSITO (opuesto al config general): un
  // server 4174 preexistente podría ser un preview sin el flag enforcing —
  // silenciosamente el test correría contra headers no-enforcing. La corrida
  // debe siempre levantar el suyo con el flag.
  webServer: {
    command: 'pnpm --filter @store-mgmt/web-store-pos exec vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...ambientEnv(),
      // Activates the `csp-enforcing-preview-header` preview middleware and
      // the `preview.proxy` '/api' forward in apps/web-store-pos/vite.config.ts.
      E2E_CSP_ENFORCE: '1',
    },
  },
});
