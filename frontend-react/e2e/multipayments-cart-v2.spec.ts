/**
 * multipayments-cart-v2 — NEW E2E (payment-channels-and-multipayment, 2026-09-23).
 *
 * Pins the multipayment CART v2 mechanics with the MultiPayments module (16):
 *   - the default state is exactly ONE Efectivo row for the sale total, with NO
 *     rate message (the row is identity: same currency);
 *   - "Agregar pago" opens a POPUP that offers only real channels;
 *   - every row has a trash-icon delete button and deleting all rows blocks the
 *     register guard;
 *   - editing a row's amount and currency recalculates paid/remaining/change;
 *   - a sale split across two channels registers;
 *   - the dead "Cobrar" button (`multi-payment-settle`) is gone.
 *
 * Module 16 is VIP-only, so this spec mints a PRIVATE identity (real register +
 * login), enables the module for that store through the direct-DB precondition
 * fixture, refreshes the client session from `/v1/auth/me`, and then exercises
 * the real cart — same harness as `multipayments.spec.ts`. No existing spec or
 * support file is modified.
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
const REGISTER_TEXT = 'Registrar';
const ORDER_CREATED_TEXT = 'La venta fue creada satisfactoriamente.';

const ROWS = 'multi-payment-row';
const SETTLE = 'multi-payment-settle';

function productName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function storeModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('multipayments-cart-v2: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

/** Snapshot-restored plaintext session: drops the DEK material + ciphertext entities. */
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

/** Seeds 100 units of stock for every active/sellable product (plaintext store). */
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
    throw new Error(`multipayments-cart-v2: inventory seeding failed — ${outcome.reason}`);
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

test.describe.serial('multipayments cart v2 (módulo 16) — fila por defecto, popup y papelera', () => {
  test.describe.configure({ timeout: 180_000 });

  test('fila Efectivo por defecto, popup de canales, papelera, recálculo y venta en dos canales', async ({
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

    // Module 16 gate precondition (idempotent) + settle window before the DEK reset.
    await enableMultiPaymentsModule(page, storeId);
    await dropDekAndCiphertext(page);
    const moduleIds = await storeModuleIds(page);
    if (!moduleIds.includes(MULTIPAYMENTS_MODULE_ID)) {
      throw new Error(
        `multipayments-cart-v2: session lacks module ${MULTIPAYMENTS_MODULE_ID} ` +
          `(storeModuleIds=[${moduleIds.join(',')}]). The UI cannot render.`,
      );
    }

    // A CUP channel rate so a row-currency edit converts (100 CUP per 1 USD).
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

    await seedProduct(page, 'MPV2');
    await addFirstProductAndOpenCart(page, storeId);

    // ── default: ONE Efectivo row for the sale total, no rate message ──────────
    const rows = page.getByTestId(ROWS);
    await expect(rows).toHaveCount(1);
    // T21: one channel select per row, value = channelKey `${currency}|${method}`
    // — the default row is Efectivo (CUP) = '0|0'.
    await expect(rows.nth(0).getByTestId('multi-payment-channel')).toHaveValue('0|0');
    await expect(rows.nth(0).getByTestId('multi-payment-amount')).toHaveValue('10');
    await expect(page.getByTestId('multi-payment-paid')).toHaveText(/10\s*CUP/);
    await expect(page.getByTestId('multi-payment-remaining')).toHaveText(/^0\s*CUP$/);
    await expect(page.getByTestId('multi-payment-block-reason')).toHaveCount(0);
    await expect(page.getByTestId('multi-payment-row-error')).toHaveCount(0);
    await expect(page.getByTestId(SETTLE)).toHaveCount(0);

    // ── amount edit recalculates paid/remaining ────────────────────────────────
    await rows.nth(0).getByTestId('multi-payment-amount').fill('6');
    await expect(page.getByTestId('multi-payment-paid')).toHaveText(/^6\s*CUP$/);
    await expect(page.getByTestId('multi-payment-remaining')).toHaveText(/^4\s*CUP$/);
    await expect(page.getByRole('button', { name: REGISTER_TEXT })).toBeDisabled();

    // ── "Agregar pago" opens the popup with only real channels ────────────────
    await page.getByTestId('multi-payment-add').click();
    await expect(page.getByTestId('multi-payment-add-dialog')).toBeVisible();
    const channelOptions = await page
      .getByTestId('multi-payment-add-channel')
      .locator('option')
      .allInnerTexts();
    expect(channelOptions).toContain('Efectivo');
    expect(channelOptions).toContain('Transferencia (CUP)');
    expect(channelOptions.some((label) => label.includes('Zelle'))).toBe(false);

    await page.getByTestId('multi-payment-add-channel').selectOption('0|2'); // Transferencia (CUP)
    await page.getByTestId('multi-payment-add-confirm').click();
    await expect(page.getByTestId('multi-payment-add-dialog')).toHaveCount(0);
    await expect(rows).toHaveCount(2);

    // Second row amount completes the total.
    await rows.nth(1).getByTestId('multi-payment-amount').fill('4');
    await expect(page.getByTestId('multi-payment-paid')).toHaveText(/10\s*CUP/);
    await expect(page.getByTestId('multi-payment-remaining')).toHaveText(/^0\s*CUP$/);
    await expect(page.getByRole('button', { name: REGISTER_TEXT })).toBeEnabled();

    // ── channel edit recalculates (4 USD = 400 CUP at 100 CUP/USD) ────────────
    // The domain tally applies each payment only up to the remaining total
    // (`applyPayment` → min(remaining, incoming)): 6 CUP + min(4 CUP, 400 CUP)
    // keeps `paid` at the 10 CUP total and surfaces the 396 CUP overpayment as
    // `change`. That overflow IS the proof the 4 USD row converted (identity
    // would leave change at 0).
    // T21: the single channel select switches the row to a USD channel ('1|0' =
    // Efectivo (USD)); going back to the CUP Efectivo channel zeroes `change`.
    await rows.nth(1).getByTestId('multi-payment-channel').selectOption('1|0'); // Efectivo (USD)
    await expect(rows.nth(1).getByTestId('multi-payment-channel')).toHaveValue('1|0');
    await expect(page.getByTestId('multi-payment-paid')).toHaveText(/^10\s*CUP$/);
    await expect(page.getByTestId('multi-payment-remaining')).toHaveText(/^0\s*CUP$/);
    await expect(page.getByTestId('multi-payment-change')).toHaveText(/^396\s*CUP$/);
    await rows.nth(1).getByTestId('multi-payment-channel').selectOption('0|0'); // Efectivo (CUP)
    await expect(page.getByTestId('multi-payment-paid')).toHaveText(/^10\s*CUP$/);
    await expect(page.getByTestId('multi-payment-change')).toHaveText(/^0\s*CUP$/);

    // ── split sale registers ──────────────────────────────────────────────────
    await page.getByRole('button', { name: REGISTER_TEXT }).click();
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();
    await expect(page.getByTestId('cart-badge')).toHaveText('0');

    // ── trash-icon delete removes rows and blocks the register guard ──────────
    await addFirstProductAndOpenCart(page, storeId);
    const freshRows = page.getByTestId(ROWS);
    await expect(freshRows).toHaveCount(1);
    await page.getByTestId('multi-payment-remove').click();
    await expect(freshRows).toHaveCount(0);
    await expect(page.getByTestId('multi-payment-paid')).toHaveText(/^0\s*CUP$/);
    await expect(page.getByRole('button', { name: REGISTER_TEXT })).toBeDisabled();
  });
});
