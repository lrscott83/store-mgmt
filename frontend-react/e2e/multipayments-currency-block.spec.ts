/**
 * multipayments-currency-block — NEW E2E (payment-channels-and-multipayment, 2026-09-23).
 *
 * Pins the cart currency-change BLOCK and the load-time fallback with module 16:
 *   - a persisted currency preference that cannot convert every line makes the
 *     cart fall back to the cart's NATIVE currency (no error, no "0 USD") instead
 *     of painting a zero total;
 *   - choosing that currency stays blocked: the select keeps its value, a clear
 *     `cart-currency-change-error` appears, and the total never becomes "0 USD";
 *   - once the channel rate that makes the conversion possible is registered,
 *     the persisted preference is honored: the cart opens in USD and the total
 *     converts (10 CUP → 0.10 USD).
 *
 * Module 16 is VIP-only, so this spec mints a PRIVATE identity (real register +
 * login), enables the module through the direct-DB precondition fixture,
 * refreshes the client session from `/v1/auth/me`, and exercises the real cart.
 * No existing spec or support file is modified.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { LoginPage } from './support/login-page';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { seedCategoryAndProduct } from './support/store-seed';
import { enableMultiPaymentsModule, MULTIPAYMENTS_MODULE_ID } from './support/multipayments-fixture';

// i18n literals from es.ts — hardcoded, never imported.
const SALE_HEADER = 'Productos para vender';
const ALL_CATEGORIES = 'Todos';
const ADD_BUTTON = 'Adicionar';
const CURRENCY_SELECT = 'cart-currency-select';

function productName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function storeModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('multipayments-currency-block: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

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

async function seedInventoryForAllSellable(page: Page, storeId: string): Promise<void> {
  const outcome = await page.evaluate((sid) => {
    const productKey = `lizoft.store-products-${sid}`;
    const rawProducts = localStorage.getItem(productKey);
    if (!rawProducts) return { ok: false, reason: `no ${productKey} in localStorage` };
    if (rawProducts.startsWith('enc:v1:')) {
      return { ok: false, reason: `${productKey} is enc:v1: ciphertext` };
    }
    let productsEntries: [string, Record<string, unknown>][];
    try {
      productsEntries = JSON.parse(rawProducts);
    } catch (cause) {
      return { ok: false, reason: `${productKey} is not JSON (${String(cause)})` };
    }
    const invKey = `lizoft.store-inventory-entries-${sid}`;
    let invMapEntries: [string, Record<string, unknown>[]][] = [];
    const rawInv = localStorage.getItem(invKey);
    if (rawInv && !rawInv.startsWith('enc:v1:')) {
      try {
        invMapEntries = JSON.parse(rawInv);
      } catch {
        invMapEntries = [];
      }
    }
    let sellable = 0;
    let withStock = 0;
    for (const [productId, product] of productsEntries) {
      if (!product['isActive'] || !product['availableToSale']) continue;
      sellable += 1;
      let bucket = invMapEntries.find(([pid]) => pid === productId);
      if (!bucket) {
        bucket = [productId, []];
        invMapEntries.push(bucket);
      }
      if (!bucket[1].some((entry) => entry['isActive'])) {
        bucket[1].push({
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
        });
      }
      if (bucket[1].some((entry) => entry['isActive'] && Number(entry['available']) > 0)) {
        withStock += 1;
      }
    }
    localStorage.setItem(invKey, JSON.stringify(invMapEntries));
    if (sellable === 0) return { ok: false, reason: `${productKey} has no sellable product` };
    if (withStock === 0) return { ok: false, reason: 'no sellable product ended up with stock' };
    return { ok: true, reason: `${withStock}/${sellable} stocked` };
  }, storeId);
  if (!outcome.ok) {
    throw new Error(`multipayments-currency-block: inventory seeding failed — ${outcome.reason}`);
  }
}

async function openCartPanel(page: Page): Promise<void> {
  const badge = page.getByTestId('cart-badge');
  await expect(badge).toBeVisible();
  await badge.locator('..').click();
}

async function addFirstProductAndOpenCart(page: Page, storeId: string): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();
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
  await openCartPanel(page);
}

async function seedProduct(page: Page, prefix: string): Promise<void> {
  await page.goto('/sales/products');
  await page.waitForLoadState('networkidle');
  await seedCategoryAndProduct(page, productName(prefix));
}

test.describe.serial('multipayments currency block (módulo 16) — cambio bloqueado y fallback', () => {
  test.describe.configure({ timeout: 180_000 });

  test('sin tasa el cambio se bloquea y el carrito cae a la moneda nativa; con la tasa se convierte', async ({
    page,
  }) => {
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    await page.waitForURL(/\/login$/);

    const loginPage = new LoginPage(page);
    await loginPage.fill(identity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    await enableMultiPaymentsModule(page, storeId);
    await dropDekAndCiphertext(page);
    const moduleIds = await storeModuleIds(page);
    if (!moduleIds.includes(MULTIPAYMENTS_MODULE_ID)) {
      throw new Error(
        `multipayments-currency-block: session lacks module ${MULTIPAYMENTS_MODULE_ID} ` +
          `(storeModuleIds=[${moduleIds.join(',')}]). The UI cannot render.`,
      );
    }

    await seedProduct(page, 'MPCB');
    await addFirstProductAndOpenCart(page, storeId);

    const headerTotal = page.locator('span.text-primary.whitespace-nowrap');

    // A persisted preference that cannot convert every line (USD without a rate)
    // makes the cart fall back to its NATIVE currency (CUP) — never an error and
    // never a zeroed total.
    const userId = await page.evaluate(() => {
      const raw = localStorage.getItem('currentUser');
      if (!raw) throw new Error('no currentUser to key the cart preference');
      return (JSON.parse(raw) as { id: string }).id;
    });
    await page.evaluate((uid) => {
      localStorage.setItem(`lizoft.cart-currency-${uid}`, '1'); // Currency.USD
    }, userId);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openCartPanel(page);

    await expect(page.getByTestId(CURRENCY_SELECT)).toHaveValue('0'); // fell back to CUP
    await expect(page.getByTestId('cart-currency-change-error')).toHaveCount(0);
    await expect(headerTotal).toHaveText(/10\s*CUP/);
    await expect(headerTotal).not.toHaveText(/0\s*USD/);

    // Choosing the unconvertible currency is BLOCKED: select stays put, an alert
    // appears, and the total never becomes "0 USD".
    await page.getByTestId(CURRENCY_SELECT).selectOption('1'); // USD
    const changeError = page.getByTestId('cart-currency-change-error');
    await expect(changeError).toBeVisible();
    await expect(changeError).toContainText('USD');
    await expect(page.getByTestId(CURRENCY_SELECT)).toHaveValue('0');
    await expect(headerTotal).toHaveText(/10\s*CUP/);
    await expect(headerTotal).not.toHaveText(/0\s*USD/);

    // Register the CUP channel rate, then the persisted preference is honored:
    // the cart opens in USD and the line converts to 0.10 USD.
    await page.goto('/management/channel-rates');
    await page.waitForLoadState('networkidle');
    // T22: registration lives in the `+ Tasa` popup (the inline card is gone).
    await page.getByTestId('channel-rate-add').click();
    await expect(page.getByTestId('channel-rate-add-dialog')).toBeVisible();
    await expect(page.getByTestId('channel-rate-value')).toBeVisible();
    await page.getByTestId('channel-rate-currency').selectOption('0'); // CUP
    await page.getByTestId('channel-rate-method').selectOption('0'); // Efectivo
    await page.getByTestId('channel-rate-value').fill('100');
    await page.getByTestId('channel-rate-submit').click();
    await expect(page.getByTestId('channel-rate-saved')).toBeVisible();

    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();
    await openCartPanel(page);

    await expect(page.getByTestId(CURRENCY_SELECT)).toHaveValue('1'); // USD honored
    await expect(page.getByTestId('cart-currency-change-error')).toHaveCount(0);
    await expect(page.getByTestId('cart-line-conversion-error')).toHaveCount(0);
    await expect(page.locator('span.text-primary.whitespace-nowrap')).toHaveText(/0\.10\s*USD/);
  });
});
