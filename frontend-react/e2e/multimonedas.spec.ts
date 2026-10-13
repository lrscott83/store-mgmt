/**
 * multimonedas — NEW coverage (2026-09-17), purely additive:
 * NO existing E2E spec is modified (E2E-untouchable rule).
 *
 * The MultiMonedas module (15) ships with the Superior/VIP plans. MMF1 pins
 * the honest negative — without the module the currency selector must NOT
 * render — and MMF6 pins the positive.
 *
 * ── The negative is CONSTRUCTED, not inherited (2026-10-13) ────────────────
 * BIRTH PLAN (owner decision 2026-10-13): a new store is born on the
 * **Superior** plan (`store-birth-superior`, 2026-10-11), which ALREADY
 * carries module 15. MMF1 used to assume the opposite ("the persona's store is
 * on the Pago plan whose catalog has no MultiMonedas"), so the honest negative
 * could no longer happen naturally. MMF1 now mints a PRIVATE identity and
 * REMOVES the module with `disableStoreModule` — a server-side mutation, which
 * the shared worker-scoped persona may never receive (e2e/README.md §"Specs que
 * mutan estado server-side") — then pins the client session through a real
 * GET /v1/auth/me. MMF6 builds its positive half with `enableStoreModule` plus
 * the same refresh. Both halves keep every original assertion.
 *
 * This suite pins the user-visible behavior the module enables:
 *
 *   MMF1  WITHOUT module 15 the product currency selector does NOT render in
 *         the create-product modal (the honest negative).
 *   MMF2  A product priced in USD shows its price WITH the currency label
 *         ("10 USD") on the sale list — never a `$` sign.
 *   MMF3  The cart total in the header shows the cart's currency label —
 *         a CUP cart reads "X CUP".
 *   MMF4  Adding a second product in a DIFFERENT currency is BLOCKED with a
 *         descriptive popup and the line never enters the cart (one currency
 *         per order) — on a store WITHOUT module 15, which is what lifts the
 *         guard today (sale.tsx:232,259; see the test for the full note).
 *   MMF5  Same-currency additions keep working (control): both lines enter
 *         the cart and the badge counts both.
 *   MMF6  WITH module 15 present, the selector renders in the create-product
 *         modal, defaulting to CUP, with the 7 currency options.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { seedCategoryAndProduct } from './support/store-seed';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import {
  MULTIMONEDAS_MODULE_ID,
  disableStoreModule,
  enableStoreModule,
} from './support/multipayments-fixture';

const SALE_HEADER = 'Productos para vender';
const ALL_CATEGORIES = 'Todos'; // SALES.ALL_CATEGORIES
const ADD_BUTTON = 'Adicionar';

const MODULE_MULTIMONEDAS = MULTIMONEDAS_MODULE_ID;

/** Module ids the CLIENT session currently carries (the gate's real input). */
async function sessionModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('multimonedas: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

/** Persona-stamped id for cross-test isolation (mirrors csv-import helpers). */
function productName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * The store persists plaintext entity rows in localStorage under
 * `lizoft.store-products-{storeId}` (owner-admin personas are seeded WITHOUT
 * a DEK). Products are stored as a Map-entries array: [[id, product], ...].
 * Returns the id of the updated/created product.
 */
async function rewriteProductCurrency(
  page: Page,
  storeId: string,
  productId: string,
  currency: number,
): Promise<void> {
  await page.evaluate(
    ({ sid, pid, cur }) => {
      const key = `lizoft.store-products-${sid}`;
      const raw = localStorage.getItem(key);
      if (!raw) throw new Error(`no products key ${key}`);
      const entries: [string, Record<string, unknown>][] = JSON.parse(raw);
      const bucket = entries.find(([id]) => id === pid);
      if (!bucket) throw new Error(`product ${pid} not found`);
      bucket[1]['currency'] = cur;
      localStorage.setItem(key, JSON.stringify(entries));
    },
    { sid: storeId, pid: productId, cur: currency },
  );
}

/**
 * Makes a freshly registered session behave like the persona snapshots the rest
 * of this spec uses: drops `currentUser`, the device DEK and every `enc:v1:`
 * ciphertext business entity, then reloads. The session re-hydrates from
 * AUTH_MODEL (`/v1/auth/me`) with NO DEK in memory, so every entity written
 * from here on is honest plaintext — which `rewriteProductCurrency` and
 * `seedInventoryForAllSellable` require (they read raw localStorage). Same
 * helper shape as multipayments.spec.ts / channel-rates-catalogue.spec.ts.
 */
async function dropDekAndCiphertext(page: Page): Promise<void> {
  await page.evaluate(() => {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === 'currentUser' || key === 'lizoft.device-dek') {
        remove.push(key);
        continue;
      }
      if (key.startsWith('lizoft.store-')) {
        const value = localStorage.getItem(key);
        if (value && value.startsWith('enc:v1:')) remove.push(key);
      }
    }
    for (const key of remove) localStorage.removeItem(key);
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

/** Reads a product's id by its exact name from storage (specs seed unique names). */
async function productIdByName(
  page: Page,
  storeId: string,
  name: string,
): Promise<string | null> {
  return page.evaluate(
    ({ sid, name }) => {
      const raw = localStorage.getItem(`lizoft.store-products-${sid}`);
      if (!raw) return null;
      const entries: [string, Record<string, unknown>][] = JSON.parse(raw);
      const found = entries.find(([, p]) => p['name'] === name);
      return found ? found[0] : null;
    },
    { sid: storeId, name },
  );
}

/**
 * Forces a full re-read of the offline entity keys: navigating away and back,
 * exactly like create-sale.spec's inventory re-seed pattern.
 */
async function reloadSalePage(page: Page): Promise<void> {
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();
}

/**
 * Seeds 100 units of inventory for EVERY sellable product (create-sale.spec's
 * documented pattern, extended to all rows): persona products discount from
 * inventory, so without stock the availability gate blocks every add.
 */
async function seedInventoryForAllSellable(page: Page, storeId: string): Promise<void> {
  await page.evaluate((sid) => {
    const productKey = `lizoft.store-products-${sid}`;
    const rawProducts = localStorage.getItem(productKey);
    if (!rawProducts) return;
    let productsEntries: [string, Record<string, unknown>][];
    try {
      productsEntries = JSON.parse(rawProducts);
    } catch {
      return;
    }
    const invKey = `lizoft.store-inventory-entries-${sid}`;
    let invMapEntries: [string, Record<string, unknown>[]][] = [];
    const rawInv = localStorage.getItem(invKey);
    if (rawInv) {
      try {
        invMapEntries = JSON.parse(rawInv);
      } catch {
        invMapEntries = [];
      }
    }
    for (const [productId, p] of productsEntries) {
      if (!p['isActive'] || !p['availableToSale']) continue;
      const bucket = invMapEntries.find(([pid]) => pid === productId);
      if (bucket?.[1].some((e) => e['isActive'])) continue;
      const entry = {
        id: crypto.randomUUID(),
        productId,
        categoryId: '',
        quantity: 100,
        available: 100,
        costPrice: 5,
        date: new Date().toISOString(),
        order: 0,
        isActive: true,
        createdDate: new Date().toISOString(),
        createdByName: 'e2e-seed',
        updatedDate: undefined,
        updatedByName: undefined,
      };
      if (bucket) bucket[1].push(entry);
      else invMapEntries.push([productId, [entry]]);
    }
    localStorage.setItem(invKey, JSON.stringify(invMapEntries));
  }, storeId);
}

/** Opens /sales/new, picks "Todos" and adds the FIRST sellable product once. */
async function addFirstProduct(page: Page, storeId: string): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();
  // Inventory stock for the persona's inventory-discounting products, then a
  // full re-read (navigate away and back) so the gate sees the seeded stock.
  await seedInventoryForAllSellable(page, storeId);
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();
  await page.getByRole('button', { name: ALL_CATEGORIES }).click();
  const addButton = page.getByRole('button', { name: ADD_BUTTON }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(page.getByTestId('cart-badge')).toHaveText('1');
}

/** Creates a product through the real UI (name + price), returning its name. */
async function createProductViaUi(page: Page, name: string, price: string): Promise<void> {
  await page.goto('/sales/products');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('add-category-button').click();
  await page.getByTestId('category-name-input').fill(name);
  await page.getByTestId('category-save-button').click();
  const categoryToggle = page.locator('[data-testid^="category-actions-toggle-"]').first();
  await categoryToggle.click();
  await page.getByTestId('add-product-button').click();
  await page.getByTestId('product-name-input').fill(name);
  await page.getByTestId('product-price-input').fill(price);
  await page.getByTestId('create-product-submit').click();
}

/**
 * Refreshes the session profile through a REAL GET /v1/auth/me and rewrites
 * localStorage.currentUser — the gate reads `user.storeModuleIds` from the
 * client session, and cold-boot makes no backend call when the cached profile
 * matches (auth-store.ts:167-177), so the constructed module set is invisible
 * until the cache is rewritten. Pattern copied from configurations.spec.ts.
 */
async function refreshSessionFromMe(page: Page): Promise<void> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`refreshSessionFromMe: GET /v1/auth/me failed (${response.status()})`);
  }
  const body = (await response.json()) as { data?: unknown };
  if (!body.data) {
    throw new Error('refreshSessionFromMe: /v1/auth/me returned no data payload');
  }
  await page.evaluate((profile) => {
    window.localStorage.setItem('currentUser', JSON.stringify(profile));
    window.localStorage.setItem(
      'current-store-id',
      (profile as { selectedStoreId?: string }).selectedStoreId ?? '',
    );
  }, body.data);
  await page.reload();
}

test.describe.serial('MultiMonedas — selector, precios con moneda y regla de una moneda', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('MMF1 sin el módulo MultiMonedas el selector de moneda NO aparece', async ({ page }) => {
    // PRIVATE identity (e2e/README.md §"Specs que mutan estado server-side"):
    // removing module 15 is a server-side mutation, so the shared persona must
    // not receive it. The store is born on Superior, which already HAS the
    // module — the negative is therefore constructed, not assumed.
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    await disableStoreModule(page, storeId, MODULE_MULTIMONEDAS);
    await refreshSessionFromMe(page);
    // Pin the negative precondition itself: the session really lacks the module,
    // so the absent selector below proves the gate instead of passing by luck.
    expect(await sessionModuleIds(page)).not.toContain(MODULE_MULTIMONEDAS);

    await page.goto('/sales/products');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('add-category-button').click();
    await page.getByTestId('category-name-input').fill(productName('mmneg'));
    await page.getByTestId('category-save-button').click();
    await page.locator('[data-testid^="category-actions-toggle-"]').first().click();
    await page.getByTestId('add-product-button').click();

    // The modal opens WITHOUT the currency selector: the session lacks module
    // 15, so currency-select.tsx:40-42 renders null. The product-name input
    // proves the modal itself is there — the gate hides only the selector.
    await expect(page.getByTestId('product-name-input')).toBeVisible();
    await expect(page.getByTestId('product-currency-select')).toHaveCount(0);
  });

  test('MMF2 un producto en USD muestra "10 USD" en la venta, sin $', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Seed another sellable product through the real UI, then reprice it to USD.
    const name = productName('MMUSDProd');
    await createProductViaUi(page, name, '10');

    const pid = await productIdByName(page, selectedStoreId, name);
    expect(pid).toBeTruthy();
    await rewriteProductCurrency(page, selectedStoreId, pid!, 1); // Currency.USD
    await reloadSalePage(page);

    await page.getByRole('button', { name: ALL_CATEGORIES }).click();
    // The USD product row shows the currency label — and never a $ sign.
    // Playwright normalizes NBSP in text matching, so a plain space matches
    // the '\u00A0' the formatter emits.
    const row = page.locator('form', { has: page.getByText(name) }).first();
    await expect(row.getByText('10 USD')).toBeVisible();
    await expect(row).not.toContainText('$');
  });

  test('MMF3 el total del carrito lleva la moneda de la venta', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // CUP cart: the header total must read "X CUP" (no $).
    await addFirstProduct(page, selectedStoreId);
    const headerTotal = page.locator('span.text-primary.whitespace-nowrap');
    await expect(headerTotal).toHaveText(/CUP$/);
    await expect(headerTotal).not.toContainText('$');
  });

  test('MMF4 no se puede mezclar monedas en el carrito', async ({ page }) => {
    // ── Constructed precondition (2026-10-13) ──────────────────────────────
    // The one-currency-per-sale guard is LIFTED by module 15: both add paths
    // pass `allowMixedCurrencies: hasMultiMonedasModuleAvailable(user)`
    // (sale.tsx:232 and :259). `currency-guard.ts:14-17` documents that lift as
    // module 16 (MultiPayments) — a discrepancy in the APP, out of this spec's
    // scope. What matters for the test: with the Superior birth plan every
    // store carries module 15, so the blocked popup is only reachable for a
    // store WITHOUT it. MMF4 therefore mints a PRIVATE identity (removing a
    // module is a server-side mutation — e2e/README.md) and constructs that
    // store explicitly. The assertion itself is unchanged.
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    await disableStoreModule(page, storeId, MODULE_MULTIMONEDAS);
    // The same reload also drops the DEK, so the products below are plaintext.
    await dropDekAndCiphertext(page);
    expect(await sessionModuleIds(page)).not.toContain(MODULE_MULTIMONEDAS);

    // Two real products through the real UI: the CUP one anchors the sale, the
    // USD one is repriced in storage (the currency selector is gated off by the
    // same module, which is precisely why the reprice goes through localStorage).
    const cupName = productName('MMCUP4');
    await createProductViaUi(page, cupName, '10');
    const usdName = productName('MMUSD2');
    await createProductViaUi(page, usdName, '10');
    const usdId = await productIdByName(page, storeId, usdName);
    expect(usdId).toBeTruthy();
    await rewriteProductCurrency(page, storeId, usdId!, 1); // Currency.USD

    // Stock every sellable row, then re-read the store by navigating away/back.
    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await seedInventoryForAllSellable(page, storeId);
    await reloadSalePage(page);
    await page.getByRole('button', { name: ALL_CATEGORIES }).click();

    // The CUP product opens the sale.
    await page
      .locator('form', { has: page.getByText(cupName) })
      .first()
      .getByRole('button', { name: ADD_BUTTON })
      .click();
    await expect(page.getByTestId('cart-badge')).toHaveText('1');

    // Add the USD product while the cart holds a CUP line → blocked popup.
    await page
      .locator('form', { has: page.getByText(usdName) })
      .first()
      .getByRole('button', { name: ADD_BUTTON })
      .click();

    await expect(page.getByText(/moneda.*distinta/i)).toBeVisible();
    await page.locator('.swal2-confirm').click();

    // The line never entered the cart: badge still 1.
    await expect(page.getByTestId('cart-badge')).toHaveText('1');
  });

  test('MMF5 dos productos de la misma moneda se agregan sin bloqueo', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // A second CUP product (inventory gets seeded for ALL sellable rows inside
    // addFirstProduct, which navigates away and back after seeding).
    const secondName = productName('MMCUP2');
    await createProductViaUi(page, secondName, '7');

    await addFirstProduct(page, selectedStoreId);

    // Second product (same CUP currency) adds cleanly.
    const secondRow = page.locator('form', { has: page.getByText(secondName) }).first();
    await secondRow.getByRole('button', { name: ADD_BUTTON }).click();
    await expect(page.getByTestId('cart-badge')).toHaveText('2');
  });

  test('MMF6 con el módulo MultiMonedas presente el selector aparece con las 7 monedas', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    // Build the positive half explicitly (`enableStoreModule` is idempotent and
    // pins the result through the real API) and refresh the cached session via
    // a real /me: the gate reads user.storeModuleIds from the client session,
    // which cold-boot takes from localStorage — without the refresh a change
    // to the module set stays invisible.
    await enableStoreModule(page, selectedStoreId, MODULE_MULTIMONEDAS);
    await refreshSessionFromMe(page);
    expect(await sessionModuleIds(page)).toContain(MODULE_MULTIMONEDAS);

    await page.goto('/sales/products');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('add-category-button').click();
    await page.getByTestId('category-name-input').fill(productName('mmpos'));
    await page.getByTestId('category-save-button').click();
    await page.locator('[data-testid^="category-actions-toggle-"]').first().click();
    await page.getByTestId('add-product-button').click();

    const select = page.getByTestId('product-currency-select');
    await expect(select).toBeVisible();
    // Default CUP + the 7 codes in the required order.
    const values = await select.locator('option').allInnerTexts();
    expect(values).toEqual(['CUP', 'USD', 'EUR', 'CLA', 'MLC', 'CAD', 'MXN']);
    await expect(select).toHaveValue('0'); // Currency.CUP default
  });
});
