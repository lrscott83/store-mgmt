import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * payment-methods-percent-tax (plan 2026-09-17) — E2E frontend PMF1–PMF6.
 *
 * Qué prueba esta suite (resumen para usuario):
 *   PMF1: el carrito muestra exactamente Efectivo y "Transferencia (CUP)"
 *         para una venta en CUP (ya no existe "Tarjeta") y el default es Efectivo.
 *   PMF2: una venta con percent/tax en 0 (defaults) suma 10 — sin regresión —
 *         y aparece agrupada como Efectivo en el Cuadre del día.
 *   PMF3: una orden con percent=1 y tax=10 muestra el total ajustado
 *         (10 + 1% de 10 + 10 = 12.1 → "$12.10" en el cuadre).
 *   PMF4: la forma de pago elegida (Transferencia (CUP)) se respeta: la venta
 *         se agrupa en el panel "Pago por Transferencia", no en Efectivo.
 *   PMF5: una orden histórica guardada con Tarjeta (legacy paidType=2) se
 *         agrupa como Transferencia — nunca se pierde en Efectivo.
 *   PMF6: una orden antigua sin ningún campo de método se interpreta como
 *         Efectivo (default histórico).
 *
 * Usa `owner-admin-with-products` (misma persona que create-sale.spec.ts).
 * Los helpers de siembra escriben la clave de órdenes como ARRAY JSON EN
 * TEXTO PLANO — `decryptEntity` pasa el texto plano sin tocarlo, que es
 * exactamente el formato "de antes del cifrado" que la compatibilidad debe
 * leer. Las órdenes creadas por UI quedan cifradas y se verifican por UI.
 */

// i18n literal strings from es.ts — hardcoded, never imported (design.md §5)
const SALE_HEADER = 'Productos para vender';
const REGISTER_TEXT = 'Registrar'; // SHOPPING_CART.REGISTER
const ALL_CATEGORIES = 'Todos'; // SALES.ALL_CATEGORIES
const ORDER_CREATED_TEXT = 'La venta fue creada satisfactoriamente.'; // SHOPPING_CART.ORDER_CREATED
const CASH_PANEL = /Resumen Efectivo/;
const TRANSFER_PANEL = /Pago por Transferencia/;

/** Orden con la forma mínima que OrderOfflineService y las vistas esperan. */
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

/** Escribe la clave de órdenes como array JSON plano (formato legacy legible). */
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

/**
 * Seeds an inventory entry for the first sellable product in localStorage,
 * so the availability check passes during the sale (100 units available).
 * Patrón documentado de create-sale.spec.ts.
 */
async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;

      let productsEntries: [string, Record<string, unknown>][];
      try {
        productsEntries = JSON.parse(rawProducts);
      } catch {
        return;
      }

      const sellableProduct = productsEntries.find(
        ([, p]) => p['isActive'] && p['availableToSale'],
      );
      if (!sellableProduct) return;
      const [productId] = sellableProduct;

      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const rawInv = localStorage.getItem(invKey);
      let invMapEntries: [string, Record<string, unknown>[]][] = [];
      if (rawInv) {
        try {
          invMapEntries = JSON.parse(rawInv);
        } catch {
          invMapEntries = [];
        }
      }

      const existingBucket = invMapEntries.find(([pid]) => pid === productId);
      if (existingBucket) {
        const hasActive = existingBucket[1].some((e) => e['isActive']);
        if (hasActive) return;
      }

      const entryId = crypto.randomUUID();
      const newEntry = {
        id: entryId,
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

      if (existingBucket) {
        existingBucket[1].push(newEntry);
      } else {
        invMapEntries.push([productId, [newEntry]]);
      }

      localStorage.setItem(invKey, JSON.stringify(invMapEntries));
    },
    { storeId },
  );
}

/** Helper: ir a /sales/new, sembrar inventario, adicionar el producto y abrir el carrito. */
async function addProductAndOpenCart(page: Page, storeId: string): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();

  await seedInventoryEntry(page, storeId);

  // Force a full re-read of inventory from localStorage
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(SALE_HEADER)).toBeVisible();

  await page.getByRole('button', { name: ALL_CATEGORIES }).click();

  const addButton = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();

  const badge = page.getByTestId('cart-badge');
  await expect(badge).toHaveText('1');
  await badge.locator('..').click();
}

test.describe.serial('PM — Formas de pago, percent y tax en el carrito', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('PMF1 — venta CUP muestra Efectivo y Transferencia (CUP), sin Tarjeta, default Efectivo', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);

    // T21: el pago se elige con un único select de canal por fila; sin el módulo
    // 16 la lista es una sola fila y para una venta CUP ofrece exactamente
    // Efectivo y Transferencia (CUP).
    const channelSelect = page.getByTestId('multi-payment-channel');
    await expect(channelSelect).toBeVisible();
    // Default: Efectivo (CUP) — channelKey = `${currency}|${method}` = '0|0'
    await expect(channelSelect).toHaveValue('0|0');
    await expect(channelSelect.locator('option')).toHaveCount(2);
    await expect(channelSelect).toContainText('Transferencia (CUP)');
    await expect(channelSelect).toContainText('Efectivo');
    // Tarjeta ya no existe como opción
    await expect(channelSelect).not.toContainText('Tarjeta');
  });

  test('PMF2 — venta con defaults: total sin regresión y agrupada como Efectivo en el cuadre', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);

    // Producto sembrado = 10; percent=0 y tax=0 → total 10 (sin regresión)
    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeEnabled();
    await page.getByTestId('multi-payment-amount').fill('10');
    await registerButton.click();
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    // El Cuadre del día agrupa la venta en Efectivo con $10
    await page.goto('/sales/today-stats');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: CASH_PANEL })).toContainText('$10');
  });

  test('PMF3 — orden con percent=1 y tax=10 muestra el total ajustado $12.10 en el cuadre', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    // Orden 10 con percent/tax (estado futuro editable): 10 + 1% de 10 + 10 = 12.1
    await page.goto('/profile/edit');
    await page.waitForLoadState('networkidle');
    await seedPlainOrders(page, selectedStoreId, [
      baseOrder({ total: 12.1, salePaymentMethod: 0, percent: 1, tax: 10 }),
    ]);

    await page.goto('/sales/today-stats');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: CASH_PANEL })).toContainText('$12.10');
  });

  test('PMF4 — venta con Transferencia (CUP) elegida se agrupa en Pago por Transferencia', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    await addProductAndOpenCart(page, selectedStoreId);

    // Elegir "Transferencia (CUP)" en el canal de la única fila de pago
    await page.getByTestId('multi-payment-channel').selectOption('0|2');

    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeEnabled();
    await registerButton.click();
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    await page.goto('/sales/today-stats');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: TRANSFER_PANEL })).toContainText('$10');
    await expect(page.getByRole('button', { name: CASH_PANEL })).toContainText('$0');
  });

  test('PMF5 — orden histórica con Tarjeta (paymentType=2) se agrupa como Transferencia', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    // Orden legacy en formato de texto plano (pre-cifrado): solo paymentType=2 (Tarjeta),
    // sin salePaymentMethod/percent/tax — el adaptador la traduce a Transferencia.
    await page.goto('/profile/edit');
    await page.waitForLoadState('networkidle');
    await seedPlainOrders(page, selectedStoreId, [baseOrder({ paymentType: 2 })]);

    await page.goto('/sales/today-stats');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: TRANSFER_PANEL })).toContainText('$10');
    await expect(page.getByRole('button', { name: CASH_PANEL })).toContainText('$0');
  });

  test('PMF6 — orden antigua sin método se interpreta como Efectivo (default histórico)', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    // Orden sin ningún campo de método ni legacy (formato más antiguo)
    await page.goto('/profile/edit');
    await page.waitForLoadState('networkidle');
    await seedPlainOrders(page, selectedStoreId, [baseOrder()]);

    await page.goto('/sales/today-stats');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: CASH_PANEL })).toContainText('$10');
    await expect(page.getByRole('button', { name: TRANSFER_PANEL })).toContainText('$0');
  });
});
