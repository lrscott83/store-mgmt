import { test, expect } from '@playwright/test';

// OFFLINE SHELL — el service worker real sirve la app sin conexión.
//
// CÓMO CORRER (desde frontend-react/):
//   pnpm --filter @store-mgmt/web-store-pos build
//   npx playwright test --config=playwright.pwa.config.ts
//
// Por qué este spec existe (y por qué NO corre con el config general):
//
// El verify-report de `pwa-offline-shell` dejó la acceptance procedure (Phase
// 8: probar el render offline en un browser real) SIN CORRER, y sin test
// automatizado que la reemplace. El 14-08-2026 un usuario reportó el síntoma
// exacto que esa phase habría cazado: abrir la app instalada sin internet
// muestra "No se puede acceder a este sitio..." en vez de la app. Causa raíz:
// el SW en producción (`pos.playground.sceiba.net`) era un build viejo
// (`app-shell-v2`) cuyo precache NO incluía `index.html` — la navegación
// offline caía al fallback `fetch(request)` sin red. Este spec automatiza la
// Phase 8: precache completo (incluido index.html) + navegación offline sirve
// el shell.
//
// Por qué contra `vite preview` y no contra el dev server: en dev el SW se
// registra pero con `globPatterns: []` (vite.config.ts design D10) — no
// precachea nada, así que el test fallaría por un motivo que no existe en
// producción. `vite preview` sirve el build real (`build/client/`) con el
// `service-worker.js` inyectado por `scripts/build-sw.mjs`, el mismo que se
// despliega.
//
// Copias literales del castellano tomadas de es.ts, nunca importadas: el
// navegador es la caja negra bajo prueba (misma política que los demás
// specs E2E).

const SIGN_IN_TITLE = 'Inicia sesión en tu cuenta'; // es.ts:69 AUTH.SIGN_IN_TITLE (fixed to match es.ts by 3e34d9d6)
// PRECACHE_NAME en app/service-worker.ts:15.
const PRECACHE_NAME = 'app-shell-v3';

/**
 * Espera a que el service worker registre, active Y CONTROLE la página.
 *
 * El registro se dispara 5s después del boot (root.tsx:84, setTimeout
 * 5000). `navigator.serviceWorker.ready` resuelve cuando el worker está
 * activo, pero NO garantiza que controle ESTA página: solo `clients.claim()`
 * (activate handler) le da control a los clientes ya abiertos, y el
 * `controller` de una página se puebla en la navegación siguiente. Por eso
 * este helper hace una recarga extra una vez que `ready` resuelve y recién
 * entonces espera `controller` — el estado del usuario que abre la app ya
 * instalada: la página de arranque SÍ pasa por el SW.
 */
async function waitForControlledServiceWorker(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'no-support';
          const reg = await navigator.serviceWorker.ready;
          return {
            state: reg.active?.state ?? 'no-active',
            controlled: navigator.serviceWorker.controller != null,
          };
        }),
      { timeout: 30_000 }
    )
    .toMatchObject({ state: 'activated' });

  // El worker ya está activo. Si la página actual no está controlada (el
  // registro pasó durante esta carga), recargar la hace pasar por el SW.
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller != null);
  if (!controlled) {
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller != null), {
        timeout: 15_000,
      })
      .toBe(true);
  }
}

/** Lee las claves de la caché de precache: prueba que el shell ESTÁ cacheado. */
async function precachedKeys(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(
    async (cacheName) => {
      if (!('caches' in window)) return [];
      const cache = await caches.open(cacheName);
      return (await cache.keys()).map((r) => r.url);
    },
    PRECACHE_NAME
  );
}

test.describe('offline shell — service worker sirve la app sin conexión', () => {
  test('precachea index.html y navega offline sirviendo la app, no un error del navegador', async ({
    page,
  }) => {
    // ---------------------------------------------------------------------
    // 1. Carga ONLINE inicial: registra el SW y llena el precache.
    // ---------------------------------------------------------------------
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: SIGN_IN_TITLE })).toBeVisible();

    // El registro corre 5s después del boot (root.tsx:84).
    await waitForControlledServiceWorker(page);

    // ---------------------------------------------------------------------
    // 2. El shell está en el precache: `index.html` + el manifest.
    //    Precondición (CLAUDE.md: pin the state that triggers the behaviour)
    //    — sin esto, "la navegación offline funciona" no distingue "sirvió
    //    el shell" de "no había nada que probar".
    // ---------------------------------------------------------------------
    const keys = await precachedKeys(page);
    expect(
      keys.some((u) => u.endsWith('/index.html')),
      `esperaba /index.html en ${PRECACHE_NAME}, pero las claves son: ${keys.join(', ')}`
    ).toBe(true);

    // ---------------------------------------------------------------------
    // 3. Cortar la red y recargar: la navegación debe ser servida por el SW
    //    desde el precache. Si el shell NO estuviera cacheado (el bug de
    //    producción app-shell-v2), el fallback `fetch(request)` fallaría y el
    //    navegador mostraría "No se puede acceder a este sitio" — Playwright
    //    lo reportaría como error de navegación.
    // ---------------------------------------------------------------------
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: SIGN_IN_TITLE })).toBeVisible();

    // Sigue siendo la app (SPA controlada por el SW), no una página de error
    // estática del navegador.
    expect(page.url()).toContain('/login');

    await page.context().setOffline(false);
  });

  test('los chunks de la ruta de login están precacheados (el shell navega offline sin fetch de red)', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: SIGN_IN_TITLE })).toBeVisible();
    await waitForControlledServiceWorker(page);

    const keys = await precachedKeys(page);

    // En SPA mode el bundle de la ruta se precachea como `assets/login-*.js`
    // (workbox-build glob sobre build/client). Sin él, la navegación offline
    // a /login pide el chunk a la red y muere.
    const loginChunkCached = keys.some((u) => /\/assets\/login-[^/]+\.js$/.test(u));
    expect(
      loginChunkCached,
      `esperaba un chunk assets/login-*.js en ${PRECACHE_NAME}, pero las claves son: ${keys.join(', ')}`
    ).toBe(true);
  });
});
