import { test, expect } from '@playwright/test';

// PRECACHE SPLIT — verifica que el precache del PWA incluya solo lo que
// Owner/StoreUser necesitan offline, y excluya las páginas de SuperAdmin.
//
// CÓMO CORRER (desde frontend-react/):
//   pnpm --filter @store-mgmt/web-store-pos build
//   npx playwright test --config=playwright.pwa.config.ts precache-split
//
// Este spec corre contra `vite preview` (el build real con el service worker
// y su precache manifest inyectado por scripts/build-sw.mjs).

const PRECACHE_NAME = 'app-shell-v3';

async function waitForControlledServiceWorker(
  page: import('@playwright/test').Page,
): Promise<void> {
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
      { timeout: 30_000 },
    )
    .toMatchObject({ state: 'activated' });

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

async function precachedKeys(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async (cacheName) => {
    if (!('caches' in window)) return [];
    const cache = await caches.open(cacheName);
    return (await cache.keys()).map((r) => r.url);
  }, PRECACHE_NAME);
}

function precachedUrls(keys: string[]): string[] {
  return keys.map((u) => new URL(u).pathname);
}

test.describe('precache split — Owner/StoreUser precacheado, SuperAdmin excluido', () => {
  test('los chunks de rutas Owner/StoreUser están precacheados', async ({ page }) => {
    await page.goto('/login');
    await waitForControlledServiceWorker(page);

    const urls = precachedUrls(await precachedKeys(page));

    // Ventas
    expect(urls.some((u) => /\/assets\/sale-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/today-orders-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/today-stats-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/credits-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/orders-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/wholesale-[^/]+\.js$/.test(u))).toBe(true);

    // Inventario
    expect(urls.some((u) => /\/assets\/available-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/today-entries-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/entries-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/today-quantities-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/today-sales-profit-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/egress-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/warehouses-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/warehouse-movements-[^/]+\.js$/.test(u))).toBe(true);

    // Gastos
    expect(urls.some((u) => /\/assets\/today-expenses-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/expenses-history-[^/]+\.js$/.test(u))).toBe(true);

    // Reportes
    expect(urls.some((u) => /\/assets\/today-report-[^/]+\.js$/.test(u))).toBe(true);

    // Estadísticas
    expect(urls.some((u) => /\/assets\/cuadre-por-fechas-[^/]+\.js$/.test(u))).toBe(true);

    // Sync
    expect(urls.some((u) => /\/assets\/export-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/import-[^/]+\.js$/.test(u))).toBe(true);

    // Management
    expect(urls.some((u) => /\/assets\/my-stores-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/edit-store-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/update-store-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/store-plan-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/user-list-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/user-create-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/user-edit-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/configurations-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/exchange-rates-[^/]+\.js$/.test(u))).toBe(true);

    // Catálogo Web
    expect(urls.some((u) => /\/assets\/public-catalog-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/web-catalog-[^/]+\.js$/.test(u))).toBe(true);
  });

  test('las librerías pesadas (PDF, scanner, gráficos) están precacheadas', async ({ page }) => {
    await page.goto('/login');
    await waitForControlledServiceWorker(page);

    const urls = precachedUrls(await precachedKeys(page));

    // PDF — jspdf + html2canvas + purify
    expect(urls.some((u) => /\/assets\/jspdf\.es\.min-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/jspdf\.plugin\.autotable-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/html2canvas\.esm-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/purify\.es-[^/]+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/inventory-today-sale-pdf-[^/]+\.js$/.test(u))).toBe(true);

    // Scanner
    expect(urls.some((u) => /\/assets\/scanner-modal-[^/]+\.js$/.test(u))).toBe(true);

    // Gráficos
    expect(urls.some((u) => /\/assets\/chart-core-[^/]+\.js$/.test(u))).toBe(true);
  });

  test('los chunks de rutas SuperAdmin NO están precacheados', async ({ page }) => {
    await page.goto('/login');
    await waitForControlledServiceWorker(page);

    const urls = precachedUrls(await precachedKeys(page));

    // Admin stores
    expect(urls.some((u) => /\/assets\/store-list-[^/]+\.js$/.test(u))).toBe(false);

    // Admin owners
    expect(urls.some((u) => /\/assets\/owner-list-[^/]+\.js$/.test(u))).toBe(false);
    expect(urls.some((u) => /\/assets\/owner-create-[^/]+\.js$/.test(u))).toBe(false);
    expect(urls.some((u) => /\/assets\/owner-edit-[^/]+\.js$/.test(u))).toBe(false);

    // Admin resellers
    expect(urls.some((u) => /\/assets\/reseller-list-[^/]+\.js$/.test(u))).toBe(false);
    expect(urls.some((u) => /\/assets\/reseller-create-[^/]+\.js$/.test(u))).toBe(false);
    expect(urls.some((u) => /\/assets\/reseller-edit-[^/]+\.js$/.test(u))).toBe(false);

    // Admin features
    expect(urls.some((u) => /\/assets\/features-[^/]+\.js$/.test(u))).toBe(false);

    // Billing (SuperAdmin + ReSeller only)
    expect(urls.some((u) => /\/assets\/collections-[^/]+\.js$/.test(u))).toBe(false);
    expect(urls.some((u) => /\/assets\/reseller-commissions-[^/]+\.js$/.test(u))).toBe(false);
  });
});
