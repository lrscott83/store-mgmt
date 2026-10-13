/**
 * payment-history-normalization — NEW E2E (payment-channels-and-multipayment, 2026-09-23).
 * Birth-plan precondition corrected 2026-10-13.
 *
 * Pins the read-path normalization of ALREADY-REGISTERED sales (D2/T9):
 * Efectivo stays "Efectivo"; Transferencia and Zelle (in any currency) present as
 * "Transferencia (CUP)" — in the sales history, today's orders, the dynamic
 * payment-method filters and the edit-order modal. Persisted data is untouched.
 *
 * ── Why a PRIVATE store without module 15 (2026-10-13) ─────────────────────
 * Both halves of what this spec asserts are produced by the SAME
 * `!multiMonedas` flag, so a Superior-born store cannot show either of them:
 *
 *   1. LABEL. `orders.tsx:632` / `today-orders.tsx:160` render
 *      `paymentMethodKeyToLabel(key, !multiMonedas)`, so with module 15 the
 *      suffix is deliberately dropped — "Transferencia", not "Transferencia
 *      (CUP)" — because the per-view currency selector on the same screen
 *      already scopes the currency (`payment-filter-options.ts:103-118`,
 *      `mayorista-sale.spec.ts:239-245`).
 *   2. VISIBLE SET. With module 15 the currency filter turns on as soon as two
 *      currencies are present (`use-currency-filter.ts:31`) and defaults to
 *      `currencies[0]`, which is USD in the agreed order
 *      (`currency-totals.ts:34`, USD → EUR → CUP). This spec's own data has a
 *      CUP Efectivo + CUP Transferencia and a USD Zelle, so the CUP orders fall
 *      outside the selection and the method filter offers ONLY the USD Zelle —
 *      normalized to "Transferencia". Observed 2026-10-13: the radio group on
 *      `/sales/orders` rendered `Todas` + `Transferencia` and no `Efectivo`.
 *
 * Neither is an app defect: both are documented, intentional behavior. So the
 * spec no longer leans on the shared persona's plan — it BUILDS the
 * precondition it is about through
 * `support/store-without-multimonedas.ts::mintStoreWithoutMultiMonedas` (private
 * identity + `disableStoreModule` + session refresh + pinned absence), because
 * removing a module is a server-side mutation
 * (`e2e/README.md` §"Specs que mutan estado server-side").
 *
 * The seeds still go straight into the offline orders key as PLAINTEXT (the
 * pre-encryption format the read path must keep tolerating) — same seam as
 * `payment-methods.spec.ts` — and every assertion below is byte-for-byte the
 * one the persona version made.
 */

import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { mintStoreWithoutMultiMonedas } from './support/store-without-multimonedas';

// i18n literals from es.ts — hardcoded, never imported.
const CASH = 'Efectivo';
const TRANSFER_CUP = 'Transferencia (CUP)';
const ZELLE = 'Zelle';

/** Minimal order shape the offline service and the sales views expect. */
function baseOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    orderItems: [],
    total: 10,
    itemsCount: 1,
    date: now,
    type: 1, // OrderType.Normal
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: now,
    createdByName: 'e2e-seed',
    updatedDate: undefined,
    updatedByName: undefined,
    ...overrides,
  };
}

/** Writes the orders key as a PLAIN JSON array (legacy, pre-encryption format). */
async function seedPlainOrders(
  page: Page,
  storeId: string,
  orders: Record<string, unknown>[],
): Promise<void> {
  await page.evaluate(
    ({ key, orders }) => {
      localStorage.setItem(key, JSON.stringify(orders));
    },
    { key: `lizoft.store-orders-${storeId}`, orders },
  );
}

/** The three recorded methods: Efectivo (CUP), Transferencia (CUP), Zelle (USD). */
function mixedOrders(): Record<string, unknown>[] {
  return [
    baseOrder({ salePaymentMethod: 0 }), // Efectivo
    baseOrder({ salePaymentMethod: 2, currency: 0 }), // Transferencia (CUP)
    baseOrder({ salePaymentMethod: 1, currency: 1 }), // Zelle (USD) → normalized
  ];
}

test.describe('payment history normalization — Efectivo y Transferencia (CUP)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('el historial de ventas muestra solo Efectivo y Transferencia (CUP) en el filtro', async ({
    page,
  }) => {
    const storeId = await mintStoreWithoutMultiMonedas(page);

    await seedPlainOrders(page, storeId, mixedOrders());
    await page.goto('/sales/orders');
    await page.waitForLoadState('networkidle');

    // Normalization on read: Transferencia and Zelle collapse into
    // "Transferencia (CUP)"; the raw Zelle / Transferencia (USD) labels never
    // surface.
    await expect(page.getByLabel(CASH).first()).toBeVisible();
    await expect(page.getByLabel(TRANSFER_CUP).first()).toBeVisible();
    await expect(page.getByLabel(ZELLE)).toHaveCount(0);
    await expect(page.getByLabel('Transferencia (USD)')).toHaveCount(0);

    // Filtering by the normalized key matches BOTH the Transferencia and the
    // Zelle order (2), while Efectivo matches only its own (1).
    await page.getByLabel(TRANSFER_CUP).first().click();
    await page.locator('[data-testid^="date-panel-toggle-"]').first().click();
    await expect(page.locator('[data-testid^="order-panel-toggle-"]')).toHaveCount(2);

    await page.getByLabel(CASH).first().click();
    await expect(page.locator('[data-testid^="order-panel-toggle-"]')).toHaveCount(1);
  });

  test('las ventas del día muestran el mismo filtro normalizado', async ({ page }) => {
    const storeId = await mintStoreWithoutMultiMonedas(page);

    await seedPlainOrders(page, storeId, mixedOrders());
    await page.goto('/sales/today-orders');
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel(CASH).first()).toBeVisible();
    await expect(page.getByLabel(TRANSFER_CUP).first()).toBeVisible();
    await expect(page.getByLabel(ZELLE)).toHaveCount(0);

    await page.getByLabel(TRANSFER_CUP).first().click();
    await expect(page.locator('[data-testid^="order-panel-toggle-"]')).toHaveCount(2);
  });

  test('el modal de edición de una venta Zelle ofrece Transferencia (CUP), no Zelle', async ({
    page,
  }) => {
    const storeId = await mintStoreWithoutMultiMonedas(page);

    // A single order recorded as Zelle (USD).
    await seedPlainOrders(page, storeId, [baseOrder({ salePaymentMethod: 1, currency: 1 })]);
    await page.goto('/sales/today-orders');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid^="order-panel-toggle-"]')).toHaveCount(1);
    await page.locator('[data-testid^="order-panel-actions-toggle-"]').first().click();
    await page.getByTestId('edit-order-button').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(CASH)).toBeVisible();
    await expect(dialog.getByLabel(TRANSFER_CUP)).toBeChecked();
    await expect(dialog.getByLabel(ZELLE)).toHaveCount(0);
  });
});
