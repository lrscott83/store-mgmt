import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Movimientos de almacenes — cobertura extendida (plan 2026-09-08, Paso 5).
 *
 * Spec NUEVO — no reemplaza a warehouses.spec.ts (intocable por regla del
 * repo, autorizado aparte). Cubre los flujos que el spec original no cubría
 * o cubría con la UI previa al rediseño del 2026-09-07:
 *
 *   1. purchase_in visible: costo promedio ponderado en la fila del producto.
 *   2. sale_out con stock insuficiente → Swal bloqueante, almacén intacto.
 *   3. transfer_out a un destino que YA tiene stock del producto → costo
 *      ponderado mezclado en el destino (GAP-3, rama computeWeightedCost).
 *   4. sale_out + venta en tienda → FIFO descuenta con el costo del almacén.
 *   5. Cantidad decimal (0.5) en compra y salida, con round2.
 *
 * UI bajo test (rediseño 2026-09-07, warehouses.tsx): panel colapsable por
 * almacén; movimientos desde el menú de engranaje (Entrada / Movimiento /
 * Salida) que abre WarehouseMovementModal; costo promedio por producto en
 * `warehouse-product-cost-{warehouseId}-{productId}` con formatCurrency
 * (enteros sin decimales: "$660"; con centavos: "$7.33").
 *
 * Reutiliza los patrones de warehouses.spec.ts (seam enableWarehouseFeatures,
 * persona owner-admin-with-products, Swal OK, observador de toasts) sin tocar
 * el spec original.
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const MENU_ENTRY = 'Entrada'; // WAREHOUSES.MENU_ENTRY (gear item, purchase_in)
const MENU_MOVEMENT = 'Movimiento'; // WAREHOUSES.MENU_MOVEMENT (gear item, transfer_out)
const MENU_SALE_OUT = 'Salida'; // WAREHOUSES.MENU_SALE_OUT (gear item, sale_out)
const INSUFFICIENT_STOCK = 'No hay suficiente stock en el almacén.'; // Warehouse.InsufficientStock
const TODAY_ENTRIES_TITLE = 'Entradas del día'; // INVENTORY.TODAY_ENTRIES.TITLE
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.'; // SHOPPING_CART.ORDER_CREATED
const SALE_PAYMENT_LABEL = 'Pago'; // GENERAL.PAY (cart-shell.tsx:420 aria-label)
const PROFIT_HEADER = 'Ganancias del Día'; // INVENTORY.PROFIT.TITLE
const ALL_CATEGORIES = 'Todos'; // SALES.ALL_CATEGORIES
const REGISTER = 'Registrar'; // SHOPPING_CART.REGISTER

/** Adds the Warehouses(36) and Entries(31) features to the restored persona and reloads. */
async function enableWarehouseFeatures(page: Page): Promise<void> {
  await page.evaluate(() => {
    const addIds = (featureIds: number[] | undefined): number[] =>
      Array.from(new Set([...(featureIds ?? []), 36, 31]));

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.includes('authf496fc5a9f17')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const model = JSON.parse(raw);
        if (model && Array.isArray(model.featureIds)) {
          model.featureIds = addIds(model.featureIds);
        }
        if (model?.user && Array.isArray(model.user.featureIds)) {
          model.user.featureIds = addIds(model.user.featureIds);
        }
        window.localStorage.setItem(key, JSON.stringify(model));
      } catch {
        /* leave as-is */
      }
    }
    const rawCurrent = window.localStorage.getItem('currentUser');
    if (rawCurrent) {
      try {
        const current = JSON.parse(rawCurrent);
        if (current && Array.isArray(current.featureIds)) {
          current.featureIds = addIds(current.featureIds);
        }
        // isUserAuthorized grants ALSO via roles[].featureIds
        // (authorization-service.ts:35-38), so the seam must patch the same
        // feature on every role row or the menu stays visible for an OwnerAdmin
        // whose role carries 36.
        if (current && Array.isArray(current.roles)) {
          for (const role of current.roles) {
            if (role && Array.isArray(role.featureIds)) {
              role.featureIds = addIds(role.featureIds);
            }
          }
        }
        window.localStorage.setItem('currentUser', JSON.stringify(current));
      } catch {
        /* leave as-is */
      }
    }
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

async function openWarehouses(page: Page): Promise<void> {
  await page.goto('/inventory/warehouses');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('warehouses-page-title')).toBeVisible();
}

/**
 * Post-feature-37 (cde85508) the movement history lives in its own view
 * (/inventory/warehouse-movements), not inline in Almacenes. These two
 * helpers let asserts reach mv-qty-* rows in the dedicated view.
 * Authorized adaptation (2026-09-10): extended.spec.ts decimal test.
 */

/** Local calendar day key of "now" INSIDE the page (never toISOString — UTC day). */
async function localTodayKey(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });
}

/** Opens the movements history page and expands today's panel. */
async function openMovementsToday(page: Page): Promise<void> {
  await page.goto('/inventory/warehouse-movements');
  await page.waitForLoadState('networkidle');
  const todayKey = await localTodayKey(page);
  const toggle = page.getByTestId(`mv-day-panel-toggle-${todayKey}`);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}

/** Creates a warehouse via the "Nuevo almacén" modal. */
async function createWarehouse(page: Page, name: string): Promise<void> {
  await page.getByText(NEW_WAREHOUSE).click();
  await page.getByTestId('warehouse-name-input').fill(name);
  await page.getByRole('button', { name: SAVE }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

/** Opens the gear menu of a warehouse and clicks a menu item by its text. */
async function openGearMovement(page: Page, warehouseName: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `Acciones de ${warehouseName}` }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Reads the first sellable product's name from localStorage (plaintext persona format). */
async function firstProductName(page: Page, storeId: string): Promise<string> {
  const name = await page.evaluate((sid) => {
    const key = `lizoft.store-products-${sid}`;
    const raw = localStorage.getItem(key);
    if (!raw) return '';
    try {
      const entries = JSON.parse(raw) as [string, Record<string, unknown>][];
      const sellable = entries.find(([, p]) => p['isActive'] && p['availableToSale']);
      return sellable ? ((sellable[1]['name'] as string) ?? '') : '';
    } catch {
      return '';
    }
  }, storeId);
  expect(name).not.toBe('');
  return name;
}

/**
 * Expands a warehouse's panel (and its first category when present) and
 * returns the warehouse's product-row locator. Idempotent — reads
 * aria-expanded before clicking. NOTE: expandedCategories is keyed by
 * categoryId and SHARED across warehouses, so the category opened in one
 * panel renders expanded in every other warehouse's panel.
 */
async function expandAndGetProductRow(
  page: Page,
  warehouseName: string,
): Promise<ReturnType<Page['locator']>> {
  const card = page.locator(`[data-testid="warehouse-card-${warehouseName}"]`);
  const toggle = card.locator(`[data-testid^="warehouse-toggle-"]`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  const categoryToggle = card.locator(`[data-testid^="warehouse-category-toggle-"]`).first();
  await expect(categoryToggle).toBeVisible();
  if ((await categoryToggle.getAttribute('aria-expanded')) !== 'true') {
    await categoryToggle.click();
  }
  const row = card.locator('[data-testid^="warehouse-product-row-"]').first();
  await expect(row).toBeVisible();
  return row;
}

/** Reads the visible cost cell of the first product row of a warehouse. */
async function readProductCost(page: Page, warehouseName: string): Promise<string> {
  const row = await expandAndGetProductRow(page, warehouseName);
  const cost = row.locator('[data-testid^="warehouse-product-cost-"]');
  return (await cost.innerText()).trim();
}

/** Reads the first product row's onHand — the "(N)" in "Name (N)". */
async function readProductOnHand(page: Page, warehouseName: string): Promise<string> {
  const row = await expandAndGetProductRow(page, warehouseName);
  const text = await row.locator('p.font-medium').innerText();
  const match = /\(([-\d.]+)\)$/.exec(text.trim());
  return match ? match[1] : text.trim();
}

/**
 * Selects a product in the searchable product combobox (2026-09-10): clicking
 * the input opens the listbox; typing filters it; the first visible option is
 * clicked. Mirrors the inventory-entry.spec.ts combobox pattern.
 */
async function selectMovementProduct(page: Page, productName?: string): Promise<void> {
  const productInput = page.getByTestId('movement-product');
  await expect(productInput).toBeVisible();
  await productInput.click();
  if (productName) {
    await productInput.fill(productName);
  }
  const option = page.getByTestId('movement-product-listbox').locator('[role="option"]').first();
  await expect(option).toBeVisible();
  await option.click();
}

/** Fills the movement modal (product select + quantity [+ cost][+ target]) and saves. */
async function fillMovement(
  page: Page,
  opts: { product: string; quantity: string; cost?: string; target?: string },
): Promise<void> {
  await selectMovementProduct(page, opts.product);
  await page.getByTestId('movement-quantity').fill(opts.quantity);
  if (opts.cost) {
    await page.getByTestId('movement-cost').fill(opts.cost);
  }
  if (opts.target) {
    await page.getByTestId('movement-target').selectOption({ label: opts.target });
  }
  await page.getByRole('button', { name: SAVE }).click();
}

/** Dismisses a blocking Swal error dialog (stockSweetAlert default "OK" button). */
async function dismissSwal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'OK' }).click();
  await page.waitForTimeout(300); // Swal unmount animation
}

test.describe.serial('Movimientos de almacenes — cobertura extendida', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('purchase_in con costo visible: segunda compra recalcula el promedio ponderado', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Ponderado');
    const product = await firstProductName(page, selectedStoreId);

    // First purchase: 10 × $10 → cost $10.
    await openGearMovement(page, 'Ponderado', MENU_ENTRY);
    await fillMovement(page, { product, quantity: '10', cost: '10' });
    expect(await readProductCost(page, 'Ponderado')).toBe('$10');

    // Second purchase: 10 × $30 → weighted ((10×10)+(10×30))/20 = $20.
    await openGearMovement(page, 'Ponderado', MENU_ENTRY);
    await fillMovement(page, { product, quantity: '10', cost: '30' });
    expect(await readProductCost(page, 'Ponderado')).toBe('$20');
  });

  test('sale_out con stock insuficiente se bloquea con Swal y no debita', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Insuficiente');
    const product = await firstProductName(page, selectedStoreId);

    await openGearMovement(page, 'Insuficiente', MENU_ENTRY);
    await fillMovement(page, { product, quantity: '5', cost: '660' });

    // Attempt to sale_out 6 with only 5 on hand → blocking Swal, stock intact.
    await openGearMovement(page, 'Insuficiente', MENU_SALE_OUT);
    await fillMovement(page, { product, quantity: '6' });

    await expect(page.getByText(INSUFFICIENT_STOCK)).toBeVisible();
    await dismissSwal(page);

    // The movement modal STAYS OPEN on failure (warehouses.tsx closes it only
    // on success) — close it before reading the panel.
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('movement-form-sale_out')).toHaveCount(0);

    // The product row still shows 5 units.
    expect(await readProductOnHand(page, 'Insuficiente')).toBe('5');
  });

  test('transfer_out a destino con stock previo mezcla el costo ponderado (GAP-3)', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Origen');
    await createWarehouse(page, 'Destino');
    const product = await firstProductName(page, selectedStoreId);

    // Origin: 10 @ $10. Destination: 10 @ $6 (prior stock of the SAME product).
    await openGearMovement(page, 'Origen', MENU_ENTRY);
    await fillMovement(page, { product, quantity: '10', cost: '10' });
    await openGearMovement(page, 'Destino', MENU_ENTRY);
    await fillMovement(page, { product, quantity: '10', cost: '6' });

    // Transfer 5 from Origen → Destino: destination goes to 15 units at
    // ((10×6)+(5×10))/15 = 110/15 = 7.33 (weighted, round2) — the GAP-3 branch.
    await openGearMovement(page, 'Origen', MENU_MOVEMENT);
    await fillMovement(page, { product, quantity: '5', target: 'Destino' });

    expect(await readProductCost(page, 'Destino')).toBe('$7.33');
    // Origin keeps its own cost: 5 units still at $10.
    expect(await readProductCost(page, 'Origen')).toBe('$10');
  });

  test('sale_out seguida de venta en tienda descuenta FIFO con el costo del almacén', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'FIFO');
    const product = await firstProductName(page, selectedStoreId);

    await openGearMovement(page, 'FIFO', MENU_ENTRY);
    await fillMovement(page, { product, quantity: '24', cost: '660' });
    await openGearMovement(page, 'FIFO', MENU_SALE_OUT);
    await fillMovement(page, { product, quantity: '12' });

    // Warehouse debited to 12.
    expect(await readProductOnHand(page, 'FIFO')).toBe('12');

    // The store entry was created with the warehouse cost (660).
    await page.goto('/inventory/today-entries');
    await expect(page.getByText(TODAY_ENTRIES_TITLE)).toBeVisible();
    await expect(page.getByText('$660')).toBeVisible();

    // Sell 1 unit: profit = price(10) − warehouse FIFO cost(660) = −650.
    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: ALL_CATEGORIES }).click();
    const addBtn = page.getByRole('button', { name: 'Adicionar' }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(page.getByTestId('cart-badge')).toHaveText('1');
    await page.getByTestId('cart-badge').locator('..').click();
    await page.getByRole('spinbutton', { name: SALE_PAYMENT_LABEL }).fill('10');
    await page.getByRole('button', { name: REGISTER }).click();
    await expect(page.getByText(ORDER_CREATED)).toBeVisible();

    await page.goto('/inventory/today-sales-profit');
    await expect(page.getByText(PROFIT_HEADER)).toBeVisible();
    const profit = (
      await page.locator('span.text-lg.font-bold.text-success').first().innerText()
    ).trim();
    expect(profit).toBe('-$650');
  });

  test('cantidad decimal (0.5) en compra y salida con round2', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Decimal');
    const product = await firstProductName(page, selectedStoreId);

    // purchase_in 10.555 → 10.56 (round2).
    await openGearMovement(page, 'Decimal', MENU_ENTRY);
    await fillMovement(page, { product, quantity: '10.555', cost: '100' });
    expect(await readProductOnHand(page, 'Decimal')).toBe('10.56');

    // sale_out 0.5 → 10.06.
    await openGearMovement(page, 'Decimal', MENU_SALE_OUT);
    await fillMovement(page, { product, quantity: '0.5' });
    expect(await readProductOnHand(page, 'Decimal')).toBe('10.06');

    // Both movements are recorded with their ROUNDED quantities: the table is
    // rendered newest-first (getStorageMovements().reverse()), and the text
    // match must be anchored — "0.5" is a substring of "10.56".
    await openMovementsToday(page);
    await expect(
      page.locator('[data-testid^="mv-qty-"]').filter({ hasText: /^10\.56$/ }),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid^="mv-qty-"]').filter({ hasText: /^0\.5$/ }),
    ).toHaveCount(1);

    // The store entry was persisted with quantity 0.5 (round2 keeps it exact).
    const entryQty = await page.evaluate((sid) => {
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${sid}`);
      if (!raw) return null;
      try {
        const buckets = JSON.parse(raw) as [string, Record<string, unknown>[]][];
        const entries = buckets.flatMap(([, es]) => es);
        return entries.filter(
          (e) => typeof e['quantity'] === 'number' && (e['quantity'] as number) === 0.5,
        ).length;
      } catch {
        return null;
      }
    }, selectedStoreId);
    expect(entryQty).toBe(1);
  });
});
