import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { disableStoreModule } from './support/multipayments-fixture';
import {
  applyWholesaleSnapshot,
  mintWholesaleSuperiorOwner,
  type WholesaleSnapshot,
} from './support/store-wholesale-fixture';

/**
 * wholesale-plan-gate — E2E (wholesale-superior-vip-only, 2026-09-23)
 *
 * Ventas Mayoristas is Superior (3) / VIP (4) ONLY. The closed administrative
 * backend paths are covered by the backend E2E suite
 * (WholesaleSalesPagoRemovalTests.cs, 556/556 current). This spec pins the
 * FRONTEND gate at the two points a Pago user could reach the feature:
 *
 *  1. sidebar: menu-config.ts tags the WHOLESALE entry with
 *     `featureIds: [EFeatures.WholesaleSales]` (39); the sidebar filters via
 *     isUserAuthorized (NO owner-admin bypass, warehouses.spec.ts:403-406
 *     pattern). A store without module 12 never carries feature 39 — `/me`
 *     derives `featureIds` from the store's ACTIVE modules
 *     (`StoreRoleFeatureRepository.GetStoreRoleFeaturesByUserIdAsync` filters on
 *     `storeModuleIds.Contains(Feature.Module.Id)`) — so the link must NOT
 *     render.
 *  2. route: `/sales/wholesale` clientLoader (wholesale.tsx:54) redirects an
 *     authenticated user WITHOUT module 12 to their home via
 *     resolveUserHomePath — WITHOUT logout, per the auth-redirect invariant
 *     (docs/contracts/authenticated-session-redirect.md): a valid session
 *     must NEVER land on /login.
 *
 * ── La mitad "Pago" se CONSTRUYE (2026-10-13) ───────────────────────────
 * This half used the shared `owner-admin` persona because registration granted
 * exactly the Pago modules, so 12/39 were absent. The birth plan is now
 * **Superior** (owner decision 2026-10-13, `store-birth-superior`), which
 * CARRIES module 12 — the persona legitimately sees the feature and the gate
 * stops being exercised. The half now mints a PRIVATE identity and REMOVES
 * module 12 (`disableStoreModule`), rebuilding the "store Pago" case for real.
 * Removing a module is a server-side mutation the shared worker-scoped persona
 * may never receive (e2e/README.md §"Specs que mutan estado server-side").
 *
 * The Superior half is unchanged: it mints a private owner whose store carries
 * module 12 + feature 39 (the fixture's noisy precondition pins both).
 */

const WHOLESALE_HEADER = 'Ventas Mayoristas'; // SALES.WHOLESALE.HEADER, es.ts
const WHOLESALE_MENU_LINK = 'a[href="/sales/wholesale"]';
const WHOLESALE_MODULE_ID = 12;
const WHOLESALE_FEATURE_ID = 39;

/** Opens the sidebar (collapsed by default, app-layout.tsx:28) via its navbar toggle. */
async function openSidebar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Alternar barra lateral' }).click();
}

/** Module ids the CLIENT session currently carries. */
async function sessionModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('wholesale-plan-gate: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

/** Feature ids the CLIENT session currently carries (the sidebar's gate input). */
async function sessionFeatureIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('wholesale-plan-gate: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { featureIds?: number[] };
  return parsed.featureIds ?? [];
}

/**
 * Builds the "store Pago" half of the gate: a PRIVATE registered owner whose
 * store is born on Superior (so it HAS module 12 and feature 39) with module 12
 * then removed, and the cached session refreshed through a real `/v1/auth/me`.
 *
 * Both halves of the precondition are pinned afterwards: no module 12 in
 * `storeModuleIds` (the route gate) and no feature 39 in `featureIds` (the
 * sidebar gate). Without those pins the two assertions below could pass for the
 * wrong reason.
 */
async function mintPagoWholesaleOwner(page: Page): Promise<void> {
  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  // Auto-login (2026-09-28): the registration opens the session itself.
  await page.waitForURL(/\/sales\/products$/);
  const storeId = await readSelectedStoreId(page);

  await disableStoreModule(page, storeId, WHOLESALE_MODULE_ID);

  const token = await readBearerToken(page);
  const me = await page.request.get(`${E2E_API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!me.ok()) {
    throw new Error(`wholesale-plan-gate: GET /v1/auth/me failed (${me.status()})`);
  }
  const body = (await me.json()) as { data?: unknown };
  if (!body.data) {
    throw new Error('wholesale-plan-gate: /v1/auth/me returned no data payload');
  }
  await page.evaluate((profile) => {
    window.localStorage.setItem('currentUser', JSON.stringify(profile));
    window.localStorage.setItem(
      'current-store-id',
      (profile as { selectedStoreId?: string }).selectedStoreId ?? '',
    );
  }, body.data);
  await page.reload();
  await page.waitForLoadState('networkidle');

  expect(await sessionModuleIds(page)).not.toContain(WHOLESALE_MODULE_ID);
  expect(await sessionFeatureIds(page)).not.toContain(WHOLESALE_FEATURE_ID);
}

let wholesaleOwner: WholesaleSnapshot;

test.describe.serial('wholesale plan gate — Ventas Mayoristas solo en planes Superior/VIP', () => {
  test.describe.configure({ timeout: 120_000 });

  test.describe('tienda sin módulo 12 / feature 39 (precondición construida)', () => {
    test('el sidebar NO muestra el enlace a Ventas Mayoristas', async ({ page }) => {
      await mintPagoWholesaleOwner(page);

      await openSidebar(page);
      await expect(page.locator(WHOLESALE_MENU_LINK)).toHaveCount(0);
    });

    test('la ruta /sales/wholesale redirige al home sin pasar por /login', async ({ page }) => {
      await mintPagoWholesaleOwner(page);

      await page.goto('/sales/wholesale');

      // Invariante auth-redirect: el usuario tiene sesión válida → NUNCA cae en
      // /login; el loader lo lleva a su home (owner sin productos →
      // /sales/products, resolveUserHomePath).
      await expect(page).toHaveURL(/\/sales\/products$/);
    });
  });

  test.describe('tienda Superior (módulo 12 + feature 39) — acceso legítimo', () => {
    // Mint the private Superior owner once (2 registrations + 3-4 logins + 1
    // plaintext product seed); snapshots are replayed per test, zero logins.
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(90_000);
      wholesaleOwner = await mintWholesaleSuperiorOwner(browser);
    });

    test('la ruta carga el flujo mayorista y el sidebar muestra el enlace', async ({ page }) => {
      await applyWholesaleSnapshot(page, wholesaleOwner);

      // Route first, sidebar closed (default) — the header text is shared with
      // the sidebar entry, so asserting it while the menu is open would match
      // twice (strict mode).
      await page.goto('/sales/wholesale');
      await expect(page.getByText(WHOLESALE_HEADER)).toBeVisible();

      await openSidebar(page);
      await expect(page.locator(WHOLESALE_MENU_LINK)).toBeVisible();
    });
  });
});
