/**
 * multimonedas — NEW coverage (2026-09-17), purely additive:
 * NO existing E2E spec is modified (E2E-untouchable rule).
 *
 * The MultiMonedas module (15) is included in the Superior/VIP plans, and a
 * self-registered store starts on Superior with the FULL available catalog —
 * so the plain `owner-admin` persona (real register + login) HAS the module,
 * while `store-user` personas inherit whatever their store has (same store ⇒
 * also has it). This suite pins the user-visible behavior the module enables:
 *
 *   MMF1  The product currency selector renders in the create-product modal
 *         (module active), defaulting to CUP, with the 7 currency options.
 *   MMF2  A product priced in USD shows its price WITH the currency label
 *         ("10 USD") on the sale list — never a `$` sign.
 *   MMF3  The cart total in the header shows the cart's currency label —
 *         a CUP cart reads "X CUP".
 *   MMF4  Adding a second product in a DIFFERENT currency is BLOCKED with a
 *         descriptive popup and the line never enters the cart (one currency
 *         per order).
 *   MMF5  Same-currency additions keep working (control): both lines enter
 *         the cart and the badge counts both.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { seedCategoryAndProduct } from './support/store-seed';

const SALE_HEADER = 'Productos para vender';
const ALL_CATEGORIES = 'Todos'; // SALES.ALL_CATEGORIES
const ADD_BUTTON = 'Adicionar';

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

test.describe.serial('MultiMonedas — selector, precios con moneda y regla de una moneda', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('MMF1 el selector de moneda aparece con el módulo y trae las 7 monedas', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    await page.goto('/sales/products');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('add-category-button').click();
    await page.getByTestId('category-name-input').fill(productName('mmcat'));
    await page.getByTestId('category-save-button').click();
    await page.locator('[data-testid^="category-actions-toggle-"]').first().click();
    await page.getByTestId('add-product-button').click();

    const select = page.getByTestId('product-currency-select');
    await expect(select).toBeVisible();
    // Default CUP + the 7 codes in the required order.
    const values = await select.locator('option').allInnerTexts();
    expect(values).toEqual(['CUP', 'USD', 'EUR', 'CLA', 'MLC', 'CAD', 'MXN']);
    await expect(select).toHaveValue('0'); // Currency.CUP default

    // The selector disappears when the modal is cancelled (no leak).
    await page.locator('[data-testid="product-currency-select"]').waitFor({ state: 'visible' });
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

  test('MMF4 no se puede mezclar monedas en el carrito', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // A second product repriced to USD: adding it while the cart holds a CUP
    // line must be blocked (the currency guard runs before availability, so
    // no inventory is needed for the blocked row).
    const usdName = productName('MMUSD2');
    await createProductViaUi(page, usdName, '10');
    const usdId = await productIdByName(page, selectedStoreId, usdName);
    expect(usdId).toBeTruthy();
    await rewriteProductCurrency(page, selectedStoreId, usdId!, 1); // Currency.USD

    // First product stays CUP (seeded).
    await addFirstProduct(page, selectedStoreId);

    await page.getByRole('button', { name: ALL_CATEGORIES }).click();

    // Add the USD product while the cart holds a CUP line → blocked popup.
    const usdRow = page.locator('form', { has: page.getByText(usdName) }).first();
    await usdRow.getByRole('button', { name: ADD_BUTTON }).click();

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
});
