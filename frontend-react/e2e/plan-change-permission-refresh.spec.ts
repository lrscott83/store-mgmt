import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { assertStoresFeature } from './support/store-fixture';

/**
 * [2026-09-16] Refresco de permisos y menús tras cambiar el plan de una tienda.
 * Plan: docs/plans/2026-09-15-store-plan-change-permission-refresh-plan.md
 *
 * QUÉ REPRODUCE
 * El owner cambia el plan de su tienda y el menú sigue mostrando las entradas
 * del plan viejo. Mecanismo: los handlers del cambio de plan "refrescaban la
 * sesión" con `getUserByToken()`, que es cache-first — si el perfil guardado
 * coincide con el `authToken` vigente, retorna SIN tocar la red
 * (`auth-store.ts:160-177`). Un cambio de plan no emite token nuevo, así que
 * ese refresco era un no-op y `user.featureIds` / `user.storeModuleIds`
 * seguían describiendo el plan anterior, que es justo lo que filtra el sidebar
 * (`sidebar.tsx:17-31` -> `authorization-service.ts:16-41`).
 *
 * CONTRA QUÉ FALLA (antes del arreglo)
 *   (a) la sesión del cliente no cambia sus módulos/features;
 *   (b) la entrada de menú gateada por el módulo retirado SIGUE visible.
 * Con el arreglo, ambas cosas pasan sin recargar la página.
 *
 * POR QUÉ LAS DIRECCIONES SON SUPERIOR → GRATIS → SUPERIOR
 * El persona `owner-admin` registra su tienda en el plan Superior, que es el
 * único con Almacenes además de VIP
 * (`Plans/StorePlanCatalogTests.cs`: Pago(2) NO incluye el módulo 13). La
 * sesión restaurada (snapshot de `localStorage`) describe ese mismo plan, así
 * que bajar a Gratis tiene un delta observable: el módulo Almacenes (13) y su
 * feature (36) desaparecen del `/me` y el ítem `/inventory/warehouses` debe
 * desaparecer del menú. La vuelta a Superior se afirma en el mismo test, así
 * que las dos direcciones quedan cubiertas.
 *
 * (Un salto a Pago NO sirve como "subida": el catálogo de ese plan no incluye
 * Almacenes, así que la sesión refrescada tampoco lo tendría y la aserción
 * fallaría por el catálogo, no por el bug.)
 *
 * Literales en castellano copiados de `apps/web-store-pos/app/shared/lib/i18n/es.ts`
 * — nunca importados: el navegador es la caja negra bajo prueba (misma política
 * que `login.spec.ts:14-17`).
 */
const ACTIVATE_TEXT = 'Activar Plan'; // es.ts STORES.PLAN.ACTIVATE_PLAN
const SIDEBAR_LABEL = 'Navegación principal'; // sidebar.tsx aria-label
const SIDEBAR_TOGGLE = 'Alternar barra lateral'; // navbar.tsx aria-label
/** EFeatures.Warehouses — el ítem MENU.WAREHOUSES lo exige (menu-config.ts). */
const WAREHOUSES_FEATURE_ID = 36;
/** EModules.Warehouses — el módulo que el plan Gratis no incluye. */
const WAREHOUSES_MODULE_ID = 13;
const WAREHOUSES_PATH = '/inventory/warehouses';

test.use({ persona: 'owner-admin' });

// Un solo worker: la caché de persona es por worker y este archivo no puede
// gastar un segundo login contra el techo de `LoginPolicy` (misma razón que
// documenta `store-plan-activation.spec.ts`).
test.describe.configure({ mode: 'serial', timeout: 120_000 });

interface StoredSession {
  featureIds?: number[];
  storeModuleIds?: number[];
}

/** Por href: determinista sin depender de cómo se componga el nombre accesible. */
function warehousesMenuLink(page: Page): ReturnType<Page['locator']> {
  return page.locator(`a[href="${WAREHOUSES_PATH}"]`);
}

/** El sidebar arranca colapsado; el toggle solo existe mientras está cerrado. */
async function openSidebar(page: Page): Promise<void> {
  const nav = page.locator(`nav[aria-label="${SIDEBAR_LABEL}"]`);
  if (!(await nav.getAttribute('class'))?.includes('w-64')) {
    await page.getByRole('button', { name: SIDEBAR_TOGGLE }).click();
  }
  await expect(nav).toHaveClass(/w-64/);
}

async function storedSession(page: Page): Promise<StoredSession | null> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  return raw ? (JSON.parse(raw) as StoredSession) : null;
}

/** Espera a que la sesión del cliente incluya (o no) el módulo Almacenes. */
async function expectSessionModule(page: Page, present: boolean): Promise<void> {
  await expect
    .poll(
      async () => {
        const stored = await storedSession(page);
        return {
          feature: stored?.featureIds?.includes(WAREHOUSES_FEATURE_ID) ?? false,
          module: stored?.storeModuleIds?.includes(WAREHOUSES_MODULE_ID) ?? false,
        };
      },
      { message: 'la sesión del cliente debe revalidarse contra el nuevo plan' },
    )
    .toEqual({ feature: present, module: present });
}

/** Cambia el plan por la UI real: expande el panel y pulsa su acción. */
async function activatePlan(page: Page, panel: RegExp): Promise<void> {
  await page.getByRole('button', { name: panel }).click();
  await page.getByRole('button', { name: ACTIVATE_TEXT, exact: true }).click();
}

test('cambiar el plan refresca los permisos y el menú en ambas direcciones, sin recargar', async ({
  signedInPage,
}) => {
  const { page } = signedInPage;

  // REQ-13/D9: sin la feature Stores, adminFeatureLoader desloguea y todas las
  // aserciones de abajo fallarían por el motivo equivocado.
  await assertStoresFeature(page);

  // PRECONDICIÓN pineada: la tienda nace en un plan de pago, así que la sesión
  // trae el módulo Almacenes y su ítem de menú existe.
  await page.goto('/inventory/available');
  await openSidebar(page);
  await expect(warehousesMenuLink(page)).toBeVisible();
  await expectSessionModule(page, true);

  // --- Bajada: Superior → Gratis -----------------------------------------
  await page.goto('/management/stores');
  await activatePlan(page, /Gratis/);

  // (a) la sesión del cliente se revalidó contra el backend...
  await expectSessionModule(page, false);
  // (b) ...y el menú dejó de ofrecer Almacenes, SIN recargar la página.
  await openSidebar(page);
  await expect(warehousesMenuLink(page)).toHaveCount(0);

  // --- Subida: Gratis → Superior (la dirección inversa) ------------------
  await page.goto('/management/stores');
  await activatePlan(page, /Superior/);

  await expectSessionModule(page, true);
  await openSidebar(page);
  await expect(warehousesMenuLink(page)).toBeVisible();
});
