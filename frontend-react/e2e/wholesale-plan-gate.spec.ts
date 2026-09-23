import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
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
 *  1. sidebar: menu-config.ts now tags the WHOLESALE entry with
 *     `featureIds: [EFeatures.WholesaleSales]` / `moduleId:
 *     EModules.WholesaleSales`; the sidebar filters via isUserAuthorized (NO
 *     owner-admin bypass, warehouses.spec.ts:403-406 pattern) — a Pago store
 *     never carries feature 39, so the link must NOT render.
 *  2. route: `/sales/wholesale` clientLoader (wholesale.tsx) redirects an
 *     authenticated user WITHOUT module 12 to their home via
 *     resolveUserHomePath — WITHOUT logout, per the auth-redirect invariant
 *     (docs/contracts/authenticated-session-redirect.md): a valid session
 *     must NEVER land on /login.
 *
 * The Pago half uses the built-in `owner-admin` persona (self-registered
 * store on the Pago birth plan — RegisterCommand grants exactly the Pago
 * modules, so 12/39 are absent). The Superior half mints a private owner
 * upgraded through the app's own change-plan endpoint (the fixture's noisy
 * precondition pins module 12 + feature 39 in the session).
 */

const WHOLESALE_HEADER = 'Ventas Mayoristas'; // SALES.WHOLESALE.HEADER, es.ts
const WHOLESALE_MENU_LINK = 'a[href="/sales/wholesale"]';

/** Opens the sidebar (collapsed by default, app-layout.tsx:28) via its navbar toggle. */
async function openSidebar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Alternar barra lateral' }).click();
}

let wholesaleOwner: WholesaleSnapshot;

test.describe.serial('wholesale plan gate — Ventas Mayoristas solo en planes Superior/VIP', () => {
  test.describe.configure({ timeout: 120_000 });

  test.describe('tienda Pago (sin módulo 12 / feature 39)', () => {
    test.use({ persona: 'owner-admin' });

    test('el sidebar NO muestra el enlace a Ventas Mayoristas', async ({ signedInPage }) => {
      const { page } = signedInPage;

      await openSidebar(page);
      await expect(page.locator(WHOLESALE_MENU_LINK)).toHaveCount(0);
    });

    test('la ruta /sales/wholesale redirige al home sin pasar por /login', async ({
      signedInPage,
    }) => {
      const { page } = signedInPage;

      await page.goto('/sales/wholesale');

      // Invariante auth-redirect: el usuario tiene sesión válida → NUNCA cae en
      // /login; el loader lo lleva a su home (owner Pago sin productos →
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