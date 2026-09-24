/**
 * multipayments (módulo 16) — NEW E2E coverage (2026-09-19), purely additive:
 * NO existing spec or support file is modified (E2E-untouchable rule).
 *
 * The MultiPayments UI (cart currency selector + multi-payment list) renders
 * ONLY when the client session has module 16 (`hasMultiPaymentsModuleAvailable`).
 * Module 16 is VIP-only, so a freshly self-registered store (Superior, modules
 * 2..15) does NOT have it — the spec mints a PRIVATE identity (real register +
 * login), enables module 16 for that store's `StoreModule` rows through the
 * direct-DB precondition fixture, refreshes the client session from
 * `/v1/auth/me`, and then exercises the real cart.
 *
 * Coverage (payment-channels-and-multipayment, T11 — behavior updated 2026-09-23):
 *   T10.1  gate precondition + currency selector (CUP/USD). Choosing a currency
 *          that cannot convert is now BLOCKED: the select stays on CUP, a clear
 *          `cart-currency-change-error` alert appears, and the header total
 *          never becomes "0 USD". Registering the channel rate makes the change
 *          proceed (0.10 USD) and the allowed choice survives a reload.
 *   T10.2  the multipayment block now starts from the DEFAULT single Efectivo
 *          row (amount = sale total), "Agregar pago" opens the channel POPUP,
 *          rows are located per-row (the testids match more than one element)
 *          and "Cobrar" (`multi-payment-settle`) no longer exists. A registered
 *          CUP rate converts the CUP line into the USD sale; two channels cover
 *          the total and the sale registers; overpaying shows positive
 *          `multi-payment-change`; an underpaid sale is still blocked
 *          (`data-block-reason="underpaid"`).
 *
 * Private identity is mandatory (server-side mutation rule, e2e/README.md
 * §"Specs que mutan estado server-side"). Login budget: 1 register + 2 real
 * logins total (one per test).
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { LoginPage } from './support/login-page';
import { RegisterPage } from './support/register-page';
import { newTestIdentity, type TestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { seedCategoryAndProduct } from './support/store-seed';
import { enableMultiPaymentsModule, MULTIPAYMENTS_MODULE_ID } from './support/multipayments-fixture';

// i18n literals from es.ts — hardcoded, never imported.
const SALE_HEADER = 'Productos para vender';
const REGISTER_TEXT = 'Registrar';
const ORDER_CREATED_TEXT = 'La venta fue creada satisfactoriamente.';
const ALL_CATEGORIES = 'Todos';
const ADD_BUTTON = 'Adicionar';

const CART_CURRENCY_SELECT = 'cart-currency-select';
const CART_CURRENCY_CHANGE_ERROR = 'cart-currency-change-error';
const CART_LINE_ERROR = 'cart-line-conversion-error';
const MULTI_PAYMENT_SETTLE = 'multi-payment-settle';

/** Unique product/category name per run (mirrors multimonedas.spec helpers). */
function productName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Reads `currentUser.storeModuleIds` from the app's own localStorage record. */
async function storeModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'multipayments.spec: localStorage.currentUser is empty — a valid authenticated session is ' +
        'required before the MultiPayments gate can be asserted.',
    );
  }
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

/**
 * Makes the live private session behave like a snapshot-restored persona:
 * drops the DEK material + the ciphertext business entities the real login just
 * wrote, then reloads so the session is re-hydrated from AUTH_MODEL
 * (`/v1/auth/me`) with NO DEK in memory.
 *
 * The clear list mirrors `support/session.ts`'s snapshot exclusion EXACTLY —
 * `lizoft.device-dek` plus every `lizoft.store-*` whose value starts with
 * `enc:v1:` — plus `currentUser`, which forces the `getUserByToken` fallback to
 * refresh from `/v1/auth/me` (a plain reload is offline-first and would keep the
 * stale cached profile). With the device-dek table gone and no roster,
 * `bootstrapDeviceDek()` cannot recover a key, `hasDeviceDekWrap()` is false and
 * `needsUnlock` is false — so the valid AUTH_MODEL session survives with no
 * unlock gate, and `encryptEntity` returns PLAINTEXT (entity-crypto.ts:113).
 *
 * From here on, UI writes and raw-localStorage seeding are honest plaintext.
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

/**
 * Seeds 100 units of inventory for every active/sellable product — the
 * owner-admin-with-products pattern create-sale/multimoneda use. Without stock,
 * the availability gate blocks every add (products discount from inventory).
 *
 * HONEST BY CONSTRUCTION: unlike the create-sale/multimoneda copy, this never
 * silently no-ops. A missing products key, an `enc:v1:` (encrypted) payload, a
 * non-JSON payload, or a seed that leaves no sellable product with stock throws
 * a diagnosable error HERE — instead of letting the caller fail later on a
 * confusing "cart badge stayed 0" assertion that hides the root cause.
 */
async function seedInventoryForAllSellable(page: Page, storeId: string): Promise<void> {
  const outcome = await page.evaluate((sid) => {
    const productKey = `lizoft.store-products-${sid}`;
    const rawProducts = localStorage.getItem(productKey);
    if (!rawProducts) {
      return { ok: false, reason: `no ${productKey} in localStorage (product was never written)` };
    }
    if (rawProducts.startsWith('enc:v1:')) {
      return {
        ok: false,
        reason:
          `${productKey} holds an enc:v1: ciphertext payload — the store DEK is still in memory, ` +
          'so the product was written encrypted and cannot be seeded from raw localStorage. The ' +
          'DEK reset in dropDekAndCiphertext did not take effect.',
      };
    }
    let productsEntries: [string, Record<string, unknown>][];
    try {
      productsEntries = JSON.parse(rawProducts);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        reason: `${productKey} is not JSON (${message}); first 48 chars = "${rawProducts.slice(0, 48)}"`,
      };
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
    if (sellable === 0) {
      return { ok: false, reason: `${productKey} has no active, availableToSale product to stock` };
    }
    if (withStock === 0) {
      return { ok: false, reason: `wrote ${invKey} but no sellable product ended up with stock` };
    }
    return { ok: true, reason: `${withStock}/${sellable} sellable products stocked` };
  }, storeId);

  if (!outcome.ok) {
    throw new Error(
      `multipayments.spec: inventory seeding failed — ${outcome.reason}. The product would have no ` +
        'stock, the availability gate would block the add, and the failure would surface as a ' +
        'confusing cart-badge assertion instead of this root cause.',
    );
  }
}

/**
 * Opens /sales/new, ensures stock for every sellable row, re-reads the offline
 * store by navigating away and back (create-sale's documented re-read), adds the
 * first product once and opens the cart panel.
 *
 * Requires an EMPTY cart: it asserts the badge reads exactly `1` after the add
 * (the cart is persisted via zustand/persist, so a leftover line would make the
 * count `2` — use {@link openCartPanel} when a persisted cart must be reopened).
 */
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

/** Opens the cart panel through the cart badge (the persisted cart must be non-empty). */
async function openCartPanel(page: Page): Promise<void> {
  const badge = page.getByTestId('cart-badge');
  await expect(badge).toBeVisible();
  await badge.locator('..').click();
}

/** Seeds one CUP product (price 10) through the real products UI. */
async function seedProduct(page: Page, prefix: string): Promise<void> {
  await page.goto('/sales/products');
  await page.waitForLoadState('networkidle');
  await seedCategoryAndProduct(page, productName(prefix));
}

// Shared between the serial tests: both log in with the same private identity.
// The store (and its module 16) is created once in T10.1 and reused in T10.2.
let identity: TestIdentity;
let storeId = '';

test.describe.serial('multipayments (módulo 16) — selector, tasas, multi-pago y vuelto', () => {
  test.describe.configure({ timeout: 180_000 });

  test('T10.1 — el selector bloquea un cambio de moneda sin tasa y lo permite tras registrarla', async ({
    page,
  }) => {
    identity = newTestIdentity();

    // Mint a private, real session (server-side mutation rule).
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
    storeId = await readSelectedStoreId(page);

    // Precondition (pinned BEFORE enabling): the fresh store lacks module 16.
    expect(await storeModuleIds(page)).not.toContain(MULTIPAYMENTS_MODULE_ID);

    await enableMultiPaymentsModule(page, storeId);

    // The client session still holds the old module set, and a plain reload is
    // offline-first (auth-store.ts caches a valid profile without re-calling
    // /me). Dropping `currentUser` forces the getUserByToken fallback to
    // refresh from `/v1/auth/me` — no extra login spent.
    //
    // The SAME reset also drops the DEK material + the ciphertext business
    // entities the real login wrote, so every entity from here on is honest
    // plaintext (a snapshot-restored persona). Without it the product/inventory
    // the spec seeds are ciphertext and `seedInventoryForAllSellable` cannot
    // read them — the diagnosed root cause of T10.1's stuck cart badge.
    await dropDekAndCiphertext(page);

    const moduleIds = await storeModuleIds(page);
    if (!moduleIds.includes(MULTIPAYMENTS_MODULE_ID)) {
      throw new Error(
        `multipayments.spec: the refreshed session still lacks module ${MULTIPAYMENTS_MODULE_ID} ` +
          `(storeModuleIds=[${moduleIds.join(',')}]). The MultiPayments UI cannot render, so every ` +
          'assertion below would fail for the wrong reason.',
      );
    }

    // Seed a CUP (default currency) product.
    await seedProduct(page, 'MPT1');
    await addFirstProductAndOpenCart(page, storeId);

    // 1) Currency selector renders with the module, offering CUP + USD.
    const currencySelect = page.getByTestId(CART_CURRENCY_SELECT);
    await expect(currencySelect).toBeVisible();
    const options = await currencySelect.locator('option').allInnerTexts();
    expect(options).toEqual(['CUP', 'USD']);

    // 2) Selecting USD with NO channel rate registered is now BLOCKED (T4/D3):
    // the select stays on CUP, a clear alert appears, and the total never falls
    // to "0 USD".
    const headerTotal = page.locator('span.text-primary.whitespace-nowrap');
    await expect(headerTotal).toHaveText(/10\s*CUP/);
    await currencySelect.selectOption(String(1)); // Currency.USD
    await expect(page.getByTestId(CART_CURRENCY_CHANGE_ERROR)).toBeVisible();
    await expect(currencySelect).toHaveValue(String(0)); // stayed on CUP
    await expect(page.getByTestId(CART_LINE_ERROR)).toHaveCount(0);
    await expect(headerTotal).toHaveText(/10\s*CUP/);
    await expect(headerTotal).not.toHaveText(/0\s*USD/);

    // 3) Register the CUP channel rate (100 CUP per 1 USD) through the real UI,
    // choosing the channel explicitly (Efectivo + CUP).
    await page.goto('/management/channel-rates');
    await page.waitForLoadState('networkidle');
    // T22: registration lives in the `+ Tasa` popup (the inline card is gone).
    await page.getByTestId('channel-rate-add').click();
    await expect(page.getByTestId('channel-rate-add-dialog')).toBeVisible();
    await expect(page.getByTestId('channel-rate-value')).toBeVisible();
    await page.getByTestId('channel-rate-currency').selectOption(String(0)); // Currency.CUP
    await page.getByTestId('channel-rate-method').selectOption(String(0)); // Efectivo
    await page.getByTestId('channel-rate-value').fill('100');
    await page.getByTestId('channel-rate-submit').click();
    await expect(page.getByTestId('channel-rate-saved')).toBeVisible();

    // 4) Back in the cart the change IS allowed now and converts (10 CUP = 0.10 USD).
    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();
    await openCartPanel(page);
    await expect(page.getByTestId(CART_CURRENCY_CHANGE_ERROR)).toHaveCount(0);
    const selectWithRate = page.getByTestId(CART_CURRENCY_SELECT);
    await selectWithRate.selectOption(String(1)); // USD
    await expect(page.getByTestId(CART_LINE_ERROR)).toHaveCount(0);
    await expect(selectWithRate).toHaveValue(String(1));
    await expect(page.locator('span.text-primary.whitespace-nowrap')).toHaveText(/0\.10\s*USD/);

    // 5) The allowed choice persists across a reload (per-user preference). The
    // cart itself is persisted too (zustand/persist `lizoft-cart`), so after the
    // reload it still holds the line added above — reopen it rather than adding
    // a second one; the point here is the persisted currency preference.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openCartPanel(page);
    await expect(page.getByTestId(CART_CURRENCY_SELECT)).toHaveValue(String(1));
  });

  test('T10.2 — fila por defecto, segundo canal por el popup, recálculo y bloqueo por subpago', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.fill(identity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    storeId = await readSelectedStoreId(page);

    // Re-pin the module precondition through the real API before resetting the
    // DEK. `enableMultiPaymentsModule` is idempotent (it returns early when the
    // module is already present) and its round-trip also lets the fresh login's
    // session settle before the DEK reset reloads the app — without it the
    // reload's clientLoader can run against a half-hydrated session and bounce
    // to /login.
    await enableMultiPaymentsModule(page, storeId);

    // This fresh context's real login left the store DEK in memory (and wrote
    // ciphertext entities). Reset to plaintext BEFORE seeding anything — the
    // channel rate and product this test creates must not be `enc:v1:`.
    await dropDekAndCiphertext(page);

    const moduleIds = await storeModuleIds(page);
    if (!moduleIds.includes(MULTIPAYMENTS_MODULE_ID)) {
      throw new Error(
        `multipayments.spec: T10.2 session lacks module ${MULTIPAYMENTS_MODULE_ID} ` +
          `(storeModuleIds=[${moduleIds.join(',')}]). T10.1 must enable it first.`,
      );
    }

    // Register a CUP channel rate (100 CUP per 1 USD) through the real UI,
    // choosing the channel explicitly (Efectivo + CUP) instead of trusting the
    // selector's default.
    await page.goto('/management/channel-rates');
    await page.waitForLoadState('networkidle');
    // T22: registration lives in the `+ Tasa` popup (the inline card is gone).
    await page.getByTestId('channel-rate-add').click();
    await expect(page.getByTestId('channel-rate-add-dialog')).toBeVisible();
    await expect(page.getByTestId('channel-rate-value')).toBeVisible();
    await page.getByTestId('channel-rate-currency').selectOption(String(0)); // Currency.CUP
    await page.getByTestId('channel-rate-method').selectOption(String(0)); // Efectivo
    await page.getByTestId('channel-rate-value').fill('100');
    await page.getByTestId('channel-rate-submit').click();
    await expect(page.getByTestId('channel-rate-saved')).toBeVisible();

    await seedProduct(page, 'MPT2');
    await addFirstProductAndOpenCart(page, storeId);

    // T5: default state is exactly ONE Efectivo row for the sale total, in the
    // sale currency (CUP), with NO rate message — the row is identity.
    const rows = page.getByTestId('multi-payment-row');
    await expect(rows).toHaveCount(1);
    // T21: each row picks its channel with ONE select, value = channelKey
    // `${currency}|${method}` — the default is Efectivo + CUP ('0|0').
    await expect(rows.nth(0).getByTestId('multi-payment-channel')).toHaveValue('0|0');
    await expect(rows.nth(0).getByTestId('multi-payment-amount')).toHaveValue('10');
    await expect(page.getByTestId('multi-payment-block-reason')).toHaveCount(0);
    await expect(page.getByTestId('multi-payment-row-error')).toHaveCount(0);

    // T7: the dead "Cobrar" button no longer exists.
    await expect(page.getByTestId(MULTI_PAYMENT_SETTLE)).toHaveCount(0);

    // USD sale with the registered rate: the 10 CUP line converts to 0.10 USD.
    await page.getByTestId(CART_CURRENCY_SELECT).selectOption(String(1)); // USD
    await expect(page.getByTestId(CART_LINE_ERROR)).toHaveCount(0);
    await expect(page.locator('span.text-primary.whitespace-nowrap')).toHaveText(/0\.10\s*USD/);

    // Multi-pago: the default Efectivo row (5 CUP) + a second channel added
    // through the POPUP (Transferencia (CUP), 5 CUP) cover 0.10 USD.
    await rows.nth(0).getByTestId('multi-payment-amount').fill('5');
    await page.getByTestId('multi-payment-add').click();
    await expect(page.getByTestId('multi-payment-add-dialog')).toBeVisible();
    await page.getByTestId('multi-payment-add-channel').selectOption('0|2'); // Transferencia (CUP)
    await page.getByTestId('multi-payment-add-confirm').click();
    await expect(page.getByTestId('multi-payment-add-dialog')).toHaveCount(0);

    await expect(rows).toHaveCount(2);
    await rows.nth(1).getByTestId('multi-payment-amount').fill('5');

    await expect(page.getByTestId('multi-payment-paid')).toHaveText(/0\.10\s*USD/);
    await expect(page.getByTestId('multi-payment-remaining')).toHaveText(/^0\s*USD$/);

    // The sale registers (the multi-payment list replaces the legacy payment block).
    await page.getByRole('button', { name: REGISTER_TEXT }).click();
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();
    await expect(page.getByTestId('cart-badge')).toHaveText('0');

    // Vuelto: a single USD line above the total is allowed and shows change.
    await addFirstProductAndOpenCart(page, storeId);
    await page.getByTestId(CART_CURRENCY_SELECT).selectOption(String(1)); // USD
    const changeRows = page.getByTestId('multi-payment-row');
    await expect(changeRows).toHaveCount(1);
    await changeRows.nth(0).getByTestId('multi-payment-amount').fill('0.15');

    await expect(page.getByTestId('multi-payment-change')).toHaveText(/0\.05\s*USD/);
    await expect(page.getByTestId('multi-payment-remaining')).toHaveText(/^0\s*USD$/);
    await expect(page.getByRole('button', { name: REGISTER_TEXT })).toBeEnabled();

    // Underpaid: the sale is blocked and the reason is surfaced — INVARIANT,
    // kept intact by the rewrite.
    await changeRows.nth(0).getByTestId('multi-payment-amount').fill('0.05');
    await expect(page.getByRole('button', { name: REGISTER_TEXT })).toBeDisabled();
    await expect(page.getByTestId('multi-payment-block-reason')).toHaveAttribute(
      'data-block-reason',
      'underpaid',
    );
    await expect(page.getByTestId('multi-payment-remaining')).toHaveText(/0\.05\s*USD/);
  });
});
