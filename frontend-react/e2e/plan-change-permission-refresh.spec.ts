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
 * POR QUÉ LAS DIRECCIONES SON PAGO → GRATIS → PAGO
 * El persona `owner-admin` registra su tienda en el plan Pago (nacimiento por
 * defecto desde 2026-09-18, `CreateStoreService:45`). La sesión restaurada
 * (snapshot de `localStorage`) describe ese mismo plan, así que bajar a Gratis
 * tiene un delta observable: el módulo Estadísticas (6) y su feature Dashboard
 * (60) desaparecen del `/me` y el ítem `/stats/dashboard` debe desaparecer del
 * menú. La vuelta a Pago se afirma en el mismo test, así que las dos
 * direcciones quedan cubiertas.
 *
 * (El salto a Superior está fuera del alcance del owner desde 2026-09-18: la
 * restricción de plan reserva Superior/VIP al SuperAdmin — el backend responde
 * 403 y el modal del owner filtra esos paneles —, así que la "subida" legal es
 * a Pago y su módulo exclusivo frente a Gratis es Estadísticas (6).)
 *
 * Literales en castellano copiados de `apps/web-store-pos/app/shared/lib/i18n/es.ts`
 * — nunca importados: el navegador es la caja negra bajo prueba (misma política
 * que `login.spec.ts:14-17`).
 */
const ACTIVATE_TEXT = 'Activar Plan'; // es.ts STORES.PLAN.ACTIVATE_PLAN
const SIDEBAR_LABEL = 'Navegación principal'; // sidebar.tsx aria-label
const SIDEBAR_TOGGLE = 'Alternar barra lateral'; // navbar.tsx aria-label
/** EFeatures.Dashboard — el ítem MENU.DASHBOARD lo exige (menu-config.ts). */
const STATISTICS_FEATURE_ID = 60;
/** EModules.Statistics — el módulo que el plan Gratis no incluye. */
const STATISTICS_MODULE_ID = 6;
const STATISTICS_PATH = '/stats/dashboard';

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
function statisticsMenuLink(page: Page): ReturnType<Page['locator']> {
  return page.locator(`a[href="${STATISTICS_PATH}"]`);
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

/** Espera a que la sesión del cliente incluya (o no) el módulo Estadísticas. */
async function expectSessionModule(page: Page, present: boolean): Promise<void> {
  await expect
    .poll(
      async () => {
        const stored = await storedSession(page);
        return {
          feature: stored?.featureIds?.includes(STATISTICS_FEATURE_ID) ?? false,
          module: stored?.storeModuleIds?.includes(STATISTICS_MODULE_ID) ?? false,
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

  // PRECONDICIÓN pineada: la tienda nace en Pago (2026-09-18), así que la
  // sesión trae el módulo Estadísticas y su ítem de menú existe.
  await page.goto('/stats/dashboard');
  await openSidebar(page);
  await expect(statisticsMenuLink(page)).toBeVisible();
  await expectSessionModule(page, true);

  // --- Bajada: Pago → Gratis --------------------------------------------
  await page.goto('/management/stores');
  await activatePlan(page, /Gratis/);

  // (a) la sesión del cliente se revalidó contra el backend...
  await expectSessionModule(page, false);
  // (b) ...y el menú dejó de ofrecer Estadísticas, SIN recargar la página.
  await openSidebar(page);
  await expect(statisticsMenuLink(page)).toHaveCount(0);

  // --- Subida: Gratis → Pago (la dirección inversa) ---------------------
  await page.goto('/management/stores');
  await activatePlan(page, /Pago/);

  await expectSessionModule(page, true);
  await openSidebar(page);
  await expect(statisticsMenuLink(page)).toBeVisible();
});
