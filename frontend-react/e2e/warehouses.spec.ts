import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Almacenes — E2E Playwright (plan 2026-09-04-warehouses-plan.md)
 *
 * Cubre el flujo completo de gestión de almacenes:
 *   1. Crear almacén + entrada por compra (purchase_in) → stock visible.
 *   2. Salida a tienda (sale_out) → debita el almacén y crea una entrada en
 *      Entradas del día.
 *   3. sale_out con stock insuficiente → error, sin entrada creada.
 *   4. Transferencia almacén A → B → stock A decrece, stock B crece.
 *
 * La persona `owner-admin-with-products` NO tiene el feature Warehouses (36)
 * en su plan, así que el spec lo añade al AUTH_MODEL + currentUser en
 * localStorage (mismo seam que mutateAuthModel) y recarga — el guard
 * featureLoader lo lee de ahí.
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const PURCHASE_IN = 'Entrada (compra)'; // WAREHOUSES.PURCHASE_IN
const SALE_OUT = 'Salida a tienda'; // WAREHOUSES.SALE_OUT
const TRANSFER = 'Transferir'; // WAREHOUSES.TRANSFER
const INSUFFICIENT_STOCK = 'No hay suficiente stock en el almacén.'; // Warehouse.InsufficientStock
const TODAY_ENTRIES_TITLE = 'Entradas del día'; // INVENTORY.TODAY_ENTRIES.TITLE

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

/** Creates a warehouse and returns its visible name. */
async function createWarehouse(page: Page, name: string): Promise<void> {
  await page.getByText(NEW_WAREHOUSE).click();
  await page.getByTestId('warehouse-name-input').fill(name);
  await page.getByRole('button', { name: SAVE }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

function warehouseCard(page: Page, name: string): ReturnType<Page['locator']> {
  return page.locator(`[data-testid="warehouse-card-${name}"]`);
}

function onHandCell(page: Page, warehouseName: string): ReturnType<Page['locator']> {
  return warehouseCard(page, warehouseName)
    .locator('[data-testid^="stock-onhand-"]')
    .first();
}

function costCell(page: Page, warehouseName: string): ReturnType<Page['locator']> {
  return warehouseCard(page, warehouseName)
    .locator('[data-testid^="stock-cost-"]')
    .first();
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
 * Purchase: on an empty warehouse the only way in is the quick-purchase row
 * (product select + "Entrada (compra)"), which opens the movement form with
 * the chosen product. The same button opens a restock for stocked products.
 */
async function purchaseIn(
  page: Page,
  warehouseName: string,
  productName: string,
  quantity: string,
  cost: string,
): Promise<void> {
  await page.getByTestId(`purchase-select-${warehouseName}`).selectOption({ label: productName });
  await page.getByText(PURCHASE_IN, { exact: true }).first().click();
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByTestId('movement-cost').fill(cost);
  await page.getByRole('button', { name: SAVE }).click();
}


test.describe.serial('Almacenes — flujo completo', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('crear almacén y registrar una entrada por compra', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Almacén Central');
    const product = await firstProductName(page, selectedStoreId);
    await page.getByTestId('warehouse-toggle-Almacén Central').click();

    await purchaseIn(page, 'Almacén Central', product, '24', '660');

    // Stock visible: on-hand 24 y costo 660 en la fila del producto.
    await expect(onHandCell(page, 'Almacén Central')).toHaveText('24');
    await expect(costCell(page, 'Almacén Central')).toHaveText('$660');
  });

  test('salida a tienda debita el almacén y crea una entrada en Entradas del día', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Central');
    const product = await firstProductName(page, selectedStoreId);
    await page.getByTestId('warehouse-toggle-Central').click();
    await purchaseIn(page, 'Central', product, '24', '660');
    await expect(onHandCell(page, 'Central')).toHaveText('24');

    // Salida a tienda de 12 unidades.
    await page.getByText(SALE_OUT, { exact: true }).first().click();
    await page.getByTestId('movement-quantity').fill('12');
    await page.getByTestId('movement-reason').fill('pedido tienda');
    await page.getByRole('button', { name: SAVE }).click();

    // El almacén queda con 12.
    await expect(onHandCell(page, 'Central')).toHaveText('12');

    // La entrada aparece en Entradas del día con el costo del almacén (660).
    await page.goto('/inventory/today-entries');
    await expect(page.getByText(TODAY_ENTRIES_TITLE)).toBeVisible();
    await expect(page.getByText('660')).toBeVisible();
  });

  test('salida a tienda con stock insuficiente se bloquea y no crea entrada', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Central');
    const product = await firstProductName(page, selectedStoreId);
    await page.getByTestId('warehouse-toggle-Central').click();
    await purchaseIn(page, 'Central', product, '5', '660');
    await expect(onHandCell(page, 'Central')).toHaveText('5');

    await page.getByText(SALE_OUT, { exact: true }).first().click();
    await page.getByTestId('movement-quantity').fill('6');
    await page.getByRole('button', { name: SAVE }).click();

    // Error de stock visible (Swal) — el almacén sigue con 5.
    await expect(page.getByText(INSUFFICIENT_STOCK)).toBeVisible();
    await expect(onHandCell(page, 'Central')).toHaveText('5');

    // No se creó ninguna entrada en la tienda.
    await page.goto('/inventory/today-entries');
    await expect(page.getByText(TODAY_ENTRIES_TITLE)).toBeVisible();
    await expect(page.getByText('660')).toHaveCount(0);
  });

  test('transferencia entre almacenes mueve el stock', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Almacén A');
    await createWarehouse(page, 'Almacén B');

    const product = await firstProductName(page, selectedStoreId);
    await page.getByTestId('warehouse-toggle-Almacén A').click();
    await purchaseIn(page, 'Almacén A', product, '24', '660');
    await expect(onHandCell(page, 'Almacén A')).toHaveText('24');

    // Transferir 10 de A → B.
    await page.getByText(TRANSFER, { exact: true }).first().click();
    await page.getByTestId('movement-quantity').fill('10');
    await page.getByTestId('movement-target').selectOption({ label: 'Almacén B' });
    await page.getByRole('button', { name: SAVE }).click();

    // A queda con 14.
    await expect(onHandCell(page, 'Almacén A')).toHaveText('14');

    // B recibe 10 con el costo propagado (660).
    await page.getByTestId('warehouse-toggle-Almacén B').click();
    await expect(onHandCell(page, 'Almacén B')).toHaveText('10');
    await expect(costCell(page, 'Almacén B')).toHaveText('$660');
  });
});