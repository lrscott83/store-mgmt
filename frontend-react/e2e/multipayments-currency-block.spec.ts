/**
 * multipayments-currency-block — NEW E2E (payment-channels-and-multipayment, 2026-09-23).
 * Module gate corrected 2026-10-03.
 *
 * Pins the cart currency-change BLOCK and the load-time fallback:
 *   - the cart seeds its sale currency from the STORE's configured "Moneda de
 *     Venta" (StoreCurrencyConfigService, localStorage per store, default CUP) on
 *     app load; the per-user preference is no longer read. When the store default
 *     cannot convert every line (USD without a rate) the cart falls back to its
 *     NATIVE currency (no error, no "0 USD") instead of painting a zero total;
 *   - choosing that currency stays blocked: the select keeps its value, a clear
 *     `cart-currency-change-error` appears, and the total never becomes "0 USD";
 *   - once the channel rate that makes the conversion possible is registered,
 *     the STORE default is honored: the cart opens in USD and the total converts
 *     (10 CUP → 0.10 USD).
 *
 * ── The gate is module 15 (MultiMonedas), NOT module 16 (2026-10-03) ───────
 * Every element this spec drives belongs to the MultiMonedas half, not to the
 * multi-payment block: the cart currency selector (`cart-currency-select`),
 * the "Moneda de Venta" section of Configurations (rendered only under
 * `hasMultiMonedasModuleAvailable`, configurations.tsx:373-375), and the
 * "Tasas de Cambio" page used to register the rate (gated by
 * `moduleIds: [EModules.MultiMonedas]`, menu-config.ts:430-433). This spec never
 * touches a `multi-payment-*` element.
 *
 * It used to seed module 16 and wait for the store's sale-currency section,
 * which never renders — its own comment at the call site already said "module 15
 * renders the currency section", fifteen lines above the failure. A freshly
 * registered store is born on the Pago plan, which carries NEITHER 15 NOR 16
 * (`RegisterService.cs`), so seeding 16 alone left the screen missing.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { seedCategoryAndProduct } from './support/store-seed';
import {
  CHANNEL_RATES_MODULES,
  assertModulesInSession,
  enableStoreModules,
} from './support/multipayments-fixture';

// i18n literals from es.ts — hardcoded, never imported.
const SALE_HEADER = 'Productos para vender';
const ALL_CATEGORIES = 'Todos';
const ADD_BUTTON = 'Adicionar';
const CURRENCY_SELECT = 'cart-currency-select';

function productName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

test.describe.serial('currency block (gate: módulo 15 MultiMonedas) — cambio bloqueado y fallback', () => {
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
    // Auto-login (2026-09-28): the registration opens the session itself, so the
    // explicit login that used to sit here is gone.
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    await enableStoreModules(page, storeId, CHANNEL_RATES_MODULES);
    await dropDekAndCiphertext(page);
    await assertModulesInSession(page, CHANNEL_RATES_MODULES);

    await seedProduct(page, 'MPCB');
    await addFirstProductAndOpenCart(page, storeId);

    const headerTotal = page.locator('span.text-primary.whitespace-nowrap');

    // The cart seeds its sale currency from the STORE's configured "Moneda de
    // Venta" (sellCurrency) on app load; the per-user preference is no longer
    // read. Configure the store's sale currency as USD through the real
    // Configurations UI (module 15 is what renders the currency section), then
    // do a FULL navigation so CartShell remounts and re-seeds from the store
    // config.
    await page.goto('/management/configurations');
    await page.waitForLoadState('networkidle');
    const sellCurrencySelect = page.locator('#sell-currency-select');
    await expect(sellCurrencySelect).toBeVisible();
    await sellCurrencySelect.selectOption('1'); // Currency.USD
    await expect(sellCurrencySelect).toHaveValue('1');

    // Full navigation: CartShell remounts and seeds preferredCartCurrency from
    // the store's sellCurrency (USD). The cart item survives the reload.
    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();
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

    // Register the CUP channel rate, then the STORE sale currency is honored:
    // the cart opens in USD and the line converts to 0.10 USD.
    await page.goto('/management/channel-rates');
    await page.waitForLoadState('networkidle');
    // T22: registration lives in the `+ Tasa` popup (the inline card is gone).
    await page.getByTestId('channel-rate-add').click();
    await expect(page.getByTestId('channel-rate-add-dialog')).toBeVisible();
    await expect(page.getByTestId('channel-rate-buy-value')).toBeVisible();
    await expect(page.getByTestId('channel-rate-sell-value')).toBeVisible();
    await page.getByTestId('channel-rate-currency').selectOption('0'); // CUP
    await page.getByTestId('channel-rate-method').selectOption('0'); // Efectivo
    // Buy/sell migration (ddd41489): both values registered, the buy value
    // enables the USD conversion asserted below.
    await page.getByTestId('channel-rate-buy-value').fill('100');
    await page.getByTestId('channel-rate-sell-value').fill('100');
    await page.getByTestId('channel-rate-submit').click();
    await expect(page.getByTestId('channel-rate-saved')).toBeVisible();

    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();
    await openCartPanel(page);

    await expect(page.getByTestId(CURRENCY_SELECT)).toHaveValue('1'); // store default USD honored
    await expect(page.getByTestId('cart-currency-change-error')).toHaveCount(0);
    await expect(page.getByTestId('cart-line-conversion-error')).toHaveCount(0);
    await expect(page.locator('span.text-primary.whitespace-nowrap')).toHaveText(/0\.10\s*USD/);
  });
});
