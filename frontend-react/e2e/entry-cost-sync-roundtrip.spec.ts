import { test, expect } from './support/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * Corrección de costo de una compra que viaja por export → import a otro
 * dispositivo — E2E (decisión de producto §9a, "last import wins", 2026-09-23).
 *
 * Spec NUEVO. Ningún spec existente se modifica.
 *
 * Contrato verificado aquí:
 *   E-CS-1  Cuando se corrige el costo de una compra (con unidades ya fuera del
 *           almacén), la propagación actualiza el `costPrice` de los
 *           `productCosts` de la venta activa. Al exportar el respaldo y
 *           importarlo en un SEGUNDO dispositivo que YA tenía esa venta, el
 *           snapshot de costo importado se aplica sobre la orden existente
 *           (`updateImportedOrder`, merge §9a por índice de ítem): el
 *           dispositivo que importa pasa a mostrar el costo NUEVO.
 *
 *           Antes del arreglo, `updateImportedOrder` solo fusionaba
 *           `date`/`isActive`/`updatedDate`/`updatedByName`, así que la orden ya
 *           existente conservaba en silencio el costo VIEJO. Este spec es la
 *           regresión de esa conducta.
 *
 * Flujo (dos "dispositivos" = dos contextos de navegador aislados, cada uno con
 * su propio localStorage):
 *   Dispositivo A: features de almacén → almacén → `purchase_in` @ 50 →
 *                  `sale_out` a tienda → venta (la orden guarda costo 50).
 *   A exporta ZIP #1.
 *   Dispositivo B: mismo persona, segundo contexto → importa ZIP #1 →
 *                  ya tiene la orden con costo 50.
 *   A corrige el costo de la compra a 70 y confirma la propagación → A queda
 *                  con costo 70 en la orden.
 *   A exporta ZIP #2.
 *   B importa ZIP #2 → la orden que B YA tenía ahora guarda el costo 70.
 *
 * La aserción es doble: el valor REALMENTE almacenado
 * (`orderItems[].productCosts[].costPrice`) y el que la UI expone en la columna
 * "Costo" de `/inventory/today-sales-profit` (que se calcula sumando ese mismo
 * snapshot, `calculateOrderProfit`).
 *
 * Los helpers de almacén replican el patrón local de
 * `warehouse-cost-propagation.spec.ts` (spec existente e intocable): se copian
 * localmente en vez de importarse.
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const ALL_CATEGORIES = 'Todos';
const SALE_PAYMENT_LABEL = 'Pago';
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.'; // ORDERS.CREATED
const PROPAGATION_TITLE = 'Propagar costo de la compra'; // WAREHOUSES.PROPAGATION_TITLE
const MOVEMENT_UPDATED = 'Movimiento actualizado.'; // WAREHOUSES.MOVEMENT_UPDATED

const EXPORT_TITLE = 'Exportar datos'; // SYNC.EXPORT_TITLE
const IMPORT_TITLE = 'Importar datos'; // SYNC.IMPORT_TITLE
const IMPORT_SUCCESS = 'Los datos se importaron correctamente.'; // SYNC.IMPORT_SUCCESS
const PROFIT_HEADER = 'Ganancias del Día'; // INVENTORY.PROFIT.TITLE

const BACKUP_PASSWORD = 'entry-cost-sync-123';
const WAREHOUSE_NAME = 'Almacén SYNC';
const OLD_COST = 50;
const NEW_COST = 70;

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
  await page.getByRole('spinbutton', { name: SALE_PAYMENT_LABEL }).fill('10');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(ORDER_CREATED)).toBeVisible();
}

/** Reads the id of the LATEST active order (the sale just created). */
async function lastActiveOrderId(page: Page, storeId: string): Promise<string> {
  const id = await page.evaluate((sid) => {
    const raw = localStorage.getItem(`lizoft.store-orders-${sid}`);
    if (!raw) return '';
    try {
      const orders = JSON.parse(raw) as Array<Record<string, unknown>>;
      const active = orders.filter((o) => o['isActive'] !== false);
      return (active[active.length - 1]?.['id'] as string) ?? '';
    } catch {
      return '';
    }
  }, storeId);
  expect(id).not.toBe('');
  return id;
}

/** Reads the first `productCosts[].costPrice` of the order with `orderId`, or null. */
async function orderCostById(
  page: Page,
  storeId: string,
  orderId: string,
): Promise<number | null> {
  return page.evaluate(
    ({ sid, oid }) => {
      const raw = localStorage.getItem(`lizoft.store-orders-${sid}`);
      if (!raw) return null;
      try {
        const orders = JSON.parse(raw) as Array<Record<string, unknown>>;
        const order = orders.find((o) => o['id'] === oid);
        if (!order) return null;
        const items = (order['orderItems'] as Array<Record<string, unknown>>) ?? [];
        for (const item of items) {
          const costs = (item['productCosts'] as Array<Record<string, unknown>>) ?? [];
          if (costs.length > 0) return (costs[0]['costPrice'] as number) ?? null;
        }
        return null;
      } catch {
        return null;
      }
    },
    { sid: storeId, oid: orderId },
  );
}

/** Exports a backup ZIP from `page` and returns the downloaded file path. */
async function exportBackup(page: Page, password: string): Promise<string> {
  await page.goto('/sync/export');
  await expect(page.getByText(EXPORT_TITLE, { exact: true })).toBeVisible();
  await page.locator('#export-password').fill(password);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  return downloadPath!;
}

/** Imports a backup ZIP into `page` and waits for the success toast. */
async function importBackup(page: Page, password: string, filePath: string): Promise<void> {
  await page.goto('/sync/import');
  await expect(page.getByText(IMPORT_TITLE, { exact: true })).toBeVisible();
  await page.locator('#import-file').setInputFiles(filePath);
  await page.locator('#import-password').fill(password);
  await page.getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByText(IMPORT_SUCCESS)).toBeVisible();
}

/**
 * Asserts the UI-observable cost: the product's "Costo" cell on
 * `/inventory/today-sales-profit`, which is computed from the stored
 * `orderItems[].productCosts` snapshot (`calculateOrderProfit`).
 */
async function assertProfitCostShown(
  page: Page,
  productName: string,
  expectedCurrency: string,
): Promise<void> {
  await page.goto('/inventory/today-sales-profit');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(PROFIT_HEADER)).toBeVisible();
  const row = page.locator('table tbody tr').filter({ hasText: productName }).first();
  await expect(row).toBeVisible();
  // Desktop columns: 0 product | 1 sold | 2 price | 3 cost | 4 profit.
  await expect(row.locator('td').nth(3)).toContainText(expectedCurrency);
}

/**
 * Builds a clean second-device storage state from `page`'s context: same
 * authenticated persona, but with the device key and any ciphertext entity
 * dropped — exactly the honesty rule `captureSnapshot` uses in
 * `support/session.ts`, so the new context is a genuine, independent device
 * rather than a clone carrying the first device's keys.
 */
async function cleanSecondDeviceState(
  page: Page,
): Promise<Awaited<ReturnType<BrowserContext['storageState']>>> {
  const state = await page.context().storageState();
  return {
    cookies: state.cookies,
    origins: state.origins.map((origin) => ({
      origin: origin.origin,
      localStorage: origin.localStorage.filter(
        (entry) =>
          entry.name !== 'lizoft.device-dek' &&
          !(entry.name.startsWith('lizoft.store-') && entry.value.startsWith('enc:v1:')),
      ),
    })),
  };
}

test.describe.serial('Corrección de costo que viaja por export → import', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('E-CS-1: la corrección de costo llega por import a una orden ya existente en otro dispositivo', async ({
    signedInPage,
    browser,
  }) => {
    const { page: deviceA, selectedStoreId } = signedInPage;

    // El estado del segundo dispositivo se toma ANTES de que A escriba datos de
    // negocio: B nace con la misma sesión/persona pero sin la orden todavía.
    const deviceBState = await cleanSecondDeviceState(deviceA);

    // --- Dispositivo A: almacén, compra @ 50, salida a tienda y venta ---
    await enableWarehouseFeatures(deviceA);
    const product = await firstProductName(deviceA, selectedStoreId);

    await createWarehouse(deviceA, WAREHOUSE_NAME);
    await purchaseIn(deviceA, WAREHOUSE_NAME, product, '10', String(OLD_COST));
    const purchaseId = await latestMovementId(deviceA, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: OLD_COST,
    });

    await saleOut(deviceA, WAREHOUSE_NAME, '6');
    await createSaleOfFirstProduct(deviceA);

    const orderId = await lastActiveOrderId(deviceA, selectedStoreId);
    expect(await orderCostById(deviceA, selectedStoreId, orderId)).toBe(OLD_COST);

    // --- A exporta el respaldo #1 (costo VIEJO) ---
    const zipWithOldCost = await exportBackup(deviceA, BACKUP_PASSWORD);

    // --- Dispositivo B: contexto aislado, mismo persona ---
    const contextB = await browser.newContext({
      storageState: deviceBState,
      serviceWorkers: 'block',
    });
    const deviceB = await contextB.newPage();

    try {
      // B importa el respaldo #1: ahora tiene la orden con el costo VIEJO.
      await importBackup(deviceB, BACKUP_PASSWORD, zipWithOldCost);
      expect(await orderCostById(deviceB, selectedStoreId, orderId)).toBe(OLD_COST);
      await assertProfitCostShown(deviceB, product, '50 CUP');

      // --- A corrige el costo de la compra 50 → 70 con propagación ---
      await openMovementsToday(deviceA);
      await deviceA.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
      await deviceA.getByTestId(`mv-edit-${purchaseId}`).click();
      await deviceA.getByTestId('movement-cost').fill(String(NEW_COST));
      await deviceA.getByRole('button', { name: SAVE }).click();

      await expect(deviceA.getByText(PROPAGATION_TITLE)).toBeVisible();
      await deviceA.getByRole('button', { name: 'Si', exact: true }).click();
      await expect(deviceA.getByText(MOVEMENT_UPDATED)).toBeVisible();
      expect(await orderCostById(deviceA, selectedStoreId, orderId)).toBe(NEW_COST);

      // --- A exporta el respaldo #2 (costo NUEVO) ---
      const zipWithNewCost = await exportBackup(deviceA, BACKUP_PASSWORD);

      // --- B importa el respaldo #2: la orden que YA tenía recibe el costo NUEVO ---
      await importBackup(deviceB, BACKUP_PASSWORD, zipWithNewCost);
      expect(await orderCostById(deviceB, selectedStoreId, orderId)).toBe(NEW_COST);
      await assertProfitCostShown(deviceB, product, '70 CUP');
    } finally {
      await contextB.close();
    }
  });
});
