import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Propagación del costo al editar una compra — E2E (plan 2026-09-16, Fase 3).
 *
 * Spec NUEVO. Ningún spec existente se modifica. Verifica el flujo completo:
 *   compra → salida a tienda → venta → editar costo → la venta y el stock en
 *   tienda muestran el costo nuevo.
 *
 * Contrato verificado aquí:
 *   E-CP-1  Editar el costo de una compra con unidades fuera (en tienda / vendidas)
 *           abre el diálogo de propagación con detalle; al confirmar, el costo se
 *           propaga a la venta activa y a la entrada de tienda.
 *   E-CP-2  Editar una compra sin unidades fuera guarda directo, SIN diálogo
 *           (protege el contrato de warehouse-movement-edit-cap.spec.ts E-UI-3 y
 *           movement-reversal.spec.ts E-R5).
 *
 * Los helpers replican los de `warehouse-movement-edit-cap.spec.ts` /
 * `movement-reversal.spec.ts` (ambos intocables): enableWarehouseFeatures/
 * openWarehouses/createWarehouse/purchaseIn/saleOut/openMovementsToday/
 * latestMovementId/createSaleOfFirstProduct/firstProductName.
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const ALL_CATEGORIES = 'Todos';
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.'; // ORDERS.CREATED
const PROPAGATION_TITLE = 'Propagar costo de la compra'; // WAREHOUSES.PROPAGATION_TITLE
const PROPAGATION_DETAIL = 'ya vendidas en'; // WAREHOUSES.PROPAGATION_CONFIRM fragment
const MOVEMENT_UPDATED = 'Movimiento actualizado.'; // WAREHOUSES.MOVEMENT_UPDATED

/** Adds Warehouses(36)/Entries(31)/Movements(37) features to the persona and reloads. */
async function enableWarehouseFeatures(page: Page): Promise<void> {
  await page.evaluate(() => {
    const addIds = (featureIds: number[] | undefined): number[] =>
      Array.from(new Set([...(featureIds ?? []), 36, 31, 37]));
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

async function createWarehouse(page: Page, name: string): Promise<void> {
  await openWarehouses(page);
  await page.getByText(NEW_WAREHOUSE).click();
  await page.getByTestId('warehouse-name-input').fill(name);
  await page.getByRole('button', { name: SAVE }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

async function openGearMovement(page: Page, warehouseName: string, item: string): Promise<void> {
  await openWarehouses(page);
  await page.getByRole('button', { name: `Acciones de ${warehouseName}` }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Selects a product in the searchable product combobox (2026-09-10 pattern). */
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

async function purchaseIn(
  page: Page,
  warehouseName: string,
  productName: string,
  quantity: string,
  cost: string,
): Promise<void> {
  await openGearMovement(page, warehouseName, 'Entrada');
  await selectMovementProduct(page, productName);
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByTestId('movement-cost').fill(cost);
  await page.getByRole('button', { name: SAVE }).click();
}

async function saleOut(page: Page, warehouseName: string, quantity: string): Promise<void> {
  await openGearMovement(page, warehouseName, 'Salida');
  await selectMovementProduct(page);
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByRole('button', { name: SAVE }).click();
}

/** Reads the first sellable product's name from the persona's localStorage. */
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

/** Reads the LATEST movement id matching the predicate from localStorage. */
async function latestMovementId(
  page: Page,
  storeId: string,
  match: { type: string; quantity?: number; costPrice?: number },
): Promise<string> {
  const id = await page.evaluate(
    ({ sid, m }) => {
      const key = `lizoft.store-warehouse-stock-movements-${sid}`;
      const raw = localStorage.getItem(key);
      if (!raw) return '';
      try {
        const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
        const found = rows
          .filter(
            (r) =>
              r['type'] === m.type &&
              (m.quantity === undefined || r['quantity'] === m.quantity) &&
              (m.costPrice === undefined || r['costPrice'] === m.costPrice),
          )
          .pop();
        return found ? ((found['id'] as string) ?? '') : '';
      } catch {
        return '';
      }
    },
    { sid: storeId, m: match },
  );
  expect(id).not.toBe('');
  return id;
}

/** Creates a sale of 1 unit of the first sellable product via /sales/new. */
async function createSaleOfFirstProduct(page: Page): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: ALL_CATEGORIES }).click();
  const addBtn = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.getByTestId('cart-badge')).toHaveText('1');
  await page.getByTestId('cart-badge').locator('..').click();
  await page.getByTestId('multi-payment-amount').fill('10');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(ORDER_CREATED)).toBeVisible();
}

/**
 * Reads the `costPrice` of the store entry created by the given `sale_out`
 * movement id (encrypted-at-rest is transparent in the persona storage).
 */
async function storeEntryCostOfSaleOut(
  page: Page,
  storeId: string,
  saleOutMovementId: string,
): Promise<number | null> {
  return page.evaluate(
    ({ sid, movementId }) => {
      const key = `lizoft.store-inventory-entries-${sid}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        const buckets = JSON.parse(raw) as Array<[string, Array<Record<string, unknown>>]>;
        for (const [, entries] of buckets) {
          const found = entries.find((e) => e['warehouseSaleOutMovementId'] === movementId);
          if (found) return (found['costPrice'] as number) ?? null;
        }
        return null;
      } catch {
        return null;
      }
    },
    { sid: storeId, movementId: saleOutMovementId },
  );
}

/** Reads the unit cost snapshot of the latest ACTIVE order's first cost line. */
async function lastActiveOrderUnitCost(page: Page, storeId: string): Promise<number | null> {
  return page.evaluate((sid) => {
    const raw = localStorage.getItem(`lizoft.store-orders-${sid}`);
    if (!raw) return null;
    try {
      const orders = JSON.parse(raw) as Array<Record<string, unknown>>;
      const active = orders.filter((o) => o['isActive'] !== false);
      const last = active[active.length - 1];
      const items = (last?.['orderItems'] as Array<Record<string, unknown>>) ?? [];
      for (const item of items) {
        const costs = (item['productCosts'] as Array<Record<string, unknown>>) ?? [];
        if (costs.length > 0) return (costs[0]['costPrice'] as number) ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }, storeId);
}

test.describe.serial('Propagación del costo al editar una compra (Fase 3)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('E-CP-1: propaga el costo nuevo a la venta activa y al stock en tienda', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén PROP');
    await purchaseIn(page, 'Almacén PROP', product, '10', '50');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });

    // Salida a tienda (crea la entrada espejo a $50) + una venta de 1 unidad.
    await saleOut(page, 'Almacén PROP', '6');
    const saleOutId = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 6,
    });
    await createSaleOfFirstProduct(page);

    // Sanity: costo viejo en tienda y en la venta.
    expect(await storeEntryCostOfSaleOut(page, selectedStoreId, saleOutId)).toBe(50);
    expect(await lastActiveOrderUnitCost(page, selectedStoreId)).toBe(50);

    // Editar el costo de la compra a 70 → diálogo de propagación.
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-edit-${purchaseId}`).click();
    await page.getByTestId('movement-cost').fill('70');
    await page.getByRole('button', { name: SAVE }).click();

    await expect(page.getByText(PROPAGATION_TITLE)).toBeVisible();
    await expect(page.getByText(PROPAGATION_DETAIL, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Si', exact: true }).click();
    await expect(page.getByText(MOVEMENT_UPDATED)).toBeVisible();

    // La venta y el stock en tienda muestran el costo nuevo.
    expect(await storeEntryCostOfSaleOut(page, selectedStoreId, saleOutId)).toBe(70);
    expect(await lastActiveOrderUnitCost(page, selectedStoreId)).toBe(70);
  });

  test('E-CP-2: una compra sin unidades fuera guarda sin diálogo (protege E-UI-3/E-R5)', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén LIMPIO');
    await purchaseIn(page, 'Almacén LIMPIO', product, '10', '50');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });

    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-edit-${purchaseId}`).click();
    await page.getByTestId('movement-cost').fill('70');
    await page.getByRole('button', { name: SAVE }).click();

    await expect(page.getByText(MOVEMENT_UPDATED)).toBeVisible();
    // Sin unidades fuera del almacén NO hay diálogo de propagación.
    await expect(page.getByText(PROPAGATION_TITLE)).toHaveCount(0);
  });
});
