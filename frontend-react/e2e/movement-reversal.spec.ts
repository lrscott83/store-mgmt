import { readFileSync } from 'node:fs';
import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Movimientos de almacén — reversa y edición E2E (plan
 * 2026-09-09-warehouse-movements-reversal-plan.md).
 *
 * Cubre E-R1..E-R17e del plan sobre el historial
 * (/inventory/warehouse-movements), donde viven las acciones:
 *   E-R1  Reversa de Entrada (purchase_in) desde el historial.
 *   E-R2  Reversa de Movimiento (transfer_out).
 *   E-R3  Reversa de Salida íntegra (sale_out) — la entrada de tienda se
 *         elimina (soft) y no aparece en Entradas del día.
 *   E-R4  Salida parcialmente consumida bloquea (Swal, D3).
 *   E-R5  Edición de Entrada = reversa + nueva compra (F3).
 *   E-R6  Edición de Salida consumida bloquea (D3).
 *   E-R6b Edición de Salida íntegra a menor cantidad.
 *   E-R7  Transferencia editada a otro destino.
 *   E-R8  Desactivación tras revertir todo (guardia D5/D12).
 *   E-R9  StoreUser no ve engranajes (D6).
 *   E-R10 Historial distingue reversas (badge + icono/label, F5).
 *   E-R11 Sync round-trip con reversa (F7).
 *   E-R12 Confirmación cancelada (No) no cambia nada.
 *   E-R14 Reversa de compra con lote parcial (D9).
 *   E-R14b Reversa de compra con lote consumido bloquea.
 *   E-R17 Salida multi-lote → dos filas + dos entradas de tienda (D8).
 *   E-R17b Transferencia multi-lote → dos filas, destino con lotes exactos.
 *   E-R17c Costo exacto a la tienda: venta FIFO multi-lote (D8).
 *   E-R17d Reversa de UNA fila multi-lote (D10).
 *   E-R17e Edición de una fila multi-lote (D10).
 *
 * Los helpers replican los de warehouses.spec.ts (spec existente,
 * intocable): enableWarehouseFeatures/openWarehouses/createWarehouse/
 * purchaseIn/saleOut/dismissSwal/installToastObserver. La suite es serial
 * (una sola persona, semillas append-only encadenadas).
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const TODAY_ENTRIES_TITLE = 'Entradas del día'; // INVENTORY.TODAY_ENTRIES.TITLE
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.'; // ORDERS.CREATED
const BACKUP_PASSWORD = 'MovementReversalE2E-123';
const SALE_PAYMENT_LABEL = 'Pago';
const ALL_CATEGORIES = 'Todos';
const IMPORT_SUCCESS = 'Los datos se importaron correctamente.'; // SYNC.IMPORT_SUCCESS
const CANNOT_DEACTIVATE = 'No se puede desactivar un almacén con stock o movimientos.';
const REVERSAL_SUCCESS = 'Movimiento revertido.'; // WAREHOUSES.REVERSAL_SUCCESS
const REVERSAL_CONFIRM =
  '¿Está seguro que desea revertir este movimiento? Se ajustará el stock de los almacenes involucrados.';
const SALE_OUT_CONSUMED =
  'La salida ya fue consumida por ventas — no se puede revertir la entrada de tienda.'; // Warehouse.SaleOutAlreadyConsumed
const PURCHASE_LOT_CONSUMED =
  'El lote de la compra ya fue consumido — no quedan unidades que revertir.'; // Warehouse.PurchaseLotConsumed
const INSUFFICIENT_STOCK = 'No hay suficiente stock en el almacén.'; // Warehouse.InsufficientStock

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

async function purchaseIn(
  page: Page,
  warehouseName: string,
  productName: string,
  quantity: string,
  cost: string,
): Promise<void> {
  await openGearMovement(page, warehouseName, 'Entrada');
  await page.getByTestId('movement-product').selectOption({ label: productName });
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByTestId('movement-cost').fill(cost);
  await page.getByRole('button', { name: SAVE }).click();
}

async function saleOut(page: Page, warehouseName: string, quantity: string): Promise<void> {
  await openGearMovement(page, warehouseName, 'Salida');
  await page.getByTestId('movement-product').selectOption({ index: 1 });
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByRole('button', { name: SAVE }).click();
}

async function transferOut(
  page: Page,
  warehouseName: string,
  quantity: string,
  targetName: string,
): Promise<void> {
  await openGearMovement(page, warehouseName, 'Movimiento');
  await page.getByTestId('movement-product').selectOption({ index: 1 });
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByTestId('movement-target').selectOption({ label: targetName });
  await page.getByRole('button', { name: SAVE }).click();
}

/** Dismisses a blocking Swal error dialog (stock SweetAlert2 default "OK"). */
async function dismissSwal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'OK' }).click();
  await page.waitForTimeout(300);
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

/**
 * Reads a warehouse movement row id from localStorage (the encrypted storage is
 * transparent to the page context). Returns the LATEST movement matching a
 * predicate over the decrypted JSON.
 */
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

async function installToastObserver(page: Page, text: string): Promise<void> {
  await page.evaluate((target) => {
    const w = window as unknown as { __mrToastSeen?: string };
    w.__mrToastSeen = undefined;
    const root = document.body ?? document.documentElement;
    const observer = new MutationObserver(() => {
      if (w.__mrToastSeen === undefined && root.textContent?.includes(target)) {
        w.__mrToastSeen = target;
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }, text);
}

async function expectToastSeen(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const seen = await page.evaluate(() => {
          const w = window as unknown as { __mrToastSeen?: string };
          return w.__mrToastSeen;
        });
        return seen === text;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** Reverts a movement row from the history page and asserts the success toast. */
async function revertFromHistory(page: Page, movementId: string): Promise<void> {
  await openMovementsToday(page);
  // Observer BEFORE the action: the toast auto-closes in ~1s (warehouses.spec pattern).
  await installToastObserver(page, REVERSAL_SUCCESS);
  await page.getByTestId(`mv-actions-toggle-${movementId}`).click();
  await page.getByTestId(`mv-revert-${movementId}`).click();
  await page.getByRole('button', { name: 'Si', exact: true }).click();
  await expectToastSeen(page, REVERSAL_SUCCESS);
  await page.waitForTimeout(400); // toast unmount

  // El original queda con badge Revertido (F5).
  await openMovementsToday(page);
  await expect(page.getByTestId(`mv-reversal-badge-${movementId}`)).toBeVisible();
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

/** Reads a warehouse's onHand for the first stocked product ("Nombre (N)"). */
async function onHandOf(page: Page, warehouseName: string): Promise<string> {
  await openWarehouses(page);
  const card = page.locator(`[data-testid="warehouse-card-${warehouseName}"]`);
  const toggle = card.locator('[data-testid^="warehouse-toggle-"]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  const categoryToggle = card.locator('[data-testid^="warehouse-category-toggle-"]').first();
  if ((await categoryToggle.getAttribute('aria-expanded')) !== 'true') {
    await categoryToggle.click();
  }
  const row = card.locator('[data-testid^="warehouse-product-row-"]').first();
  await expect(row).toBeVisible();
  const text = await row.locator('p.font-medium').innerText();
  const match = /\(([-\d.]+)\)$/.exec(text.trim());
  return match ? match[1] : text.trim();
}

/** Export/import round trip via the real /sync UI. */
async function exportBackupZip(page: Page, outputPath: string): Promise<Buffer> {
  await page.goto('/sync/export');
  await page.waitForLoadState('networkidle');
  await page.locator('#export-password').fill(BACKUP_PASSWORD);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);
  return readFileSync(outputPath);
}

async function importBackupZip(page: Page, zip: Buffer, filename: string): Promise<void> {
  await page.goto('/sync/import');
  await page.waitForLoadState('networkidle');
  await installToastObserver(page, IMPORT_SUCCESS);
  await page.locator('#import-file').setInputFiles({
    name: filename,
    mimeType: 'application/zip',
    buffer: zip,
  });
  await page.locator('#import-password').fill(BACKUP_PASSWORD);
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await expectToastSeen(page, IMPORT_SUCCESS);
}

test.describe.serial('Movimientos de almacén — reversa y edición', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('E-R1: reversa de Entrada desde el historial', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R1');
    await purchaseIn(page, 'Almacén R1', product, '10', '50');
    expect(await onHandOf(page, 'Almacén R1')).toBe('10');

    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });
    await revertFromHistory(page, purchaseId);

    // El stock vuelve a 0 y el costo display a $0 (lote vacío).
    expect(await onHandOf(page, 'Almacén R1')).toBe('0');
  });

  test('E-R2: reversa de Movimiento (transfer_out)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Origen R2');
    await createWarehouse(page, 'Destino R2');
    await purchaseIn(page, 'Origen R2', product, '10', '20');
    await transferOut(page, 'Origen R2', '4', 'Destino R2');

    const transferId = await latestMovementId(page, selectedStoreId, {
      type: 'transfer_out',
      quantity: 4,
      costPrice: 20,
    });
    await revertFromHistory(page, transferId);

    // Origen recupera las 4; destino queda en 0.
    expect(await onHandOf(page, 'Origen R2')).toBe('10');
    expect(await onHandOf(page, 'Destino R2')).toBe('0');
  });

  test('E-R3: reversa de Salida íntegra elimina la entrada de tienda', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R3');
    await purchaseIn(page, 'Almacén R3', product, '12', '30');
    await saleOut(page, 'Almacén R3', '5');

    // La entrada de tienda existe en Entradas del día.
    await page.goto('/inventory/today-entries');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(TODAY_ENTRIES_TITLE)).toBeVisible();
    await expect(page.getByText(product).first()).toBeVisible();

    const saleId = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 5,
      costPrice: 30,
    });
    await revertFromHistory(page, saleId);

    // El almacén re-acredita 5.
    expect(await onHandOf(page, 'Almacén R3')).toBe('12');

    // La entrada de tienda YA no aparece en Entradas del día (soft-delete).
    await page.goto('/inventory/today-entries');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(TODAY_ENTRIES_TITLE)).toBeVisible();
    await expect(page.getByText(product).first()).not.toBeVisible();
  });

  test('E-R4: salida parcialmente consumida bloquea la reversa (D3)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R4');
    await purchaseIn(page, 'Almacén R4', product, '10', '10');
    await saleOut(page, 'Almacén R4', '6');

    // Vende 2 unidades — la entrada de 6 queda parcialmente consumida.
    await createSaleOfFirstProduct(page);
    await createSaleOfFirstProduct(page);

    const saleId = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 6,
      costPrice: 10,
    });
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${saleId}`).click();
    await page.getByTestId(`mv-revert-${saleId}`).click();
    await page.getByRole('button', { name: 'Si', exact: true }).click();
    await expect(page.getByText(SALE_OUT_CONSUMED)).toBeVisible();
    await dismissSwal(page);

    // Sin fila reversal: el original NO lleva badge.
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${saleId}`)).toHaveCount(0);
    expect(await onHandOf(page, 'Almacén R4')).toBe('4');
  });

  test('E-R5: edición de Entrada = reversa + nueva compra (F3)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R5');
    await purchaseIn(page, 'Almacén R5', product, '10', '50');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });

    // Editar: 10@$50 → 15@$70.
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-edit-${purchaseId}`).click();
    await page.getByTestId('movement-quantity').fill('15');
    await page.getByTestId('movement-cost').fill('70');
    await page.getByRole('button', { name: SAVE }).click();

    // El original lleva badge y el stock neto es 15 (reversa + compra nueva).
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toBeVisible();
    expect(await onHandOf(page, 'Almacén R5')).toBe('15');
  });

  test('E-R6: edición de Salida consumida bloquea (D3)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R6');
    await purchaseIn(page, 'Almacén R6', product, '10', '10');
    await saleOut(page, 'Almacén R6', '6');
    await createSaleOfFirstProduct(page); // consume 1

    const saleId = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 6,
      costPrice: 10,
    });
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${saleId}`).click();
    await page.getByTestId(`mv-edit-${saleId}`).click();
    await page.getByTestId('movement-quantity').fill('4');
    await page.getByRole('button', { name: SAVE }).click();

    // La reversa del paso 1 falla por consumo → Swal, sin cambios.
    await expect(page.getByText(SALE_OUT_CONSUMED)).toBeVisible();
    await dismissSwal(page);
    expect(await onHandOf(page, 'Almacén R6')).toBe('4');
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${saleId}`)).toHaveCount(0);
  });

  test('E-R6b: edición de Salida íntegra a menor cantidad', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R6b');
    await purchaseIn(page, 'Almacén R6b', product, '12', '25');
    await saleOut(page, 'Almacén R6b', '10');
    const saleId = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 10,
      costPrice: 25,
    });

    // Editar la salida de 10 → 8.
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${saleId}`).click();
    await page.getByTestId(`mv-edit-${saleId}`).click();
    await page.getByTestId('movement-quantity').fill('8');
    await page.getByRole('button', { name: SAVE }).click();

    // Stock neto: 12 − 8 = 4; la entrada de tienda nueva es de 8.
    expect(await onHandOf(page, 'Almacén R6b')).toBe('4');
    await page.goto('/inventory/today-entries');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('8', { exact: true }).first()).toBeVisible();
  });

  test('E-R7: transferencia editada a otro destino', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'A R7');
    await createWarehouse(page, 'B R7');
    await createWarehouse(page, 'C R7');
    await purchaseIn(page, 'A R7', product, '10', '5');
    await transferOut(page, 'A R7', '5', 'B R7');
    const transferId = await latestMovementId(page, selectedStoreId, {
      type: 'transfer_out',
      quantity: 5,
      costPrice: 5,
    });

    // Editar la transferencia: destino B → C, cantidad 5.
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${transferId}`).click();
    await page.getByTestId(`mv-edit-${transferId}`).click();
    await page.getByTestId('movement-target').selectOption({ label: 'C R7' });
    await page.getByRole('button', { name: SAVE }).click();

    // Neto: A queda 5 (10−5), B devuelve 5 → 0, C recibe 5.
    expect(await onHandOf(page, 'A R7')).toBe('5');
    expect(await onHandOf(page, 'B R7')).toBe('0');
    expect(await onHandOf(page, 'C R7')).toBe('5');
  });

  test('E-R8: desactivación tras revertir todo (guardia D5/D12)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R8');
    await purchaseIn(page, 'Almacén R8', product, '8', '40');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 8,
      costPrice: 40,
    });
    await revertFromHistory(page, purchaseId);

    // Con el movimiento revertido y stock 0, la desactivación pasa.
    await openWarehouses(page);
    await page.getByRole('button', { name: 'Acciones de Almacén R8' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await expect(page.getByTestId('warehouse-card-Almacén R8').getByText('(Inactivo)')).toBeVisible();
  });

  test('E-R9: StoreUser no ve engranajes (D6)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R9');
    await purchaseIn(page, 'Almacén R9', product, '5', '10');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 5,
      costPrice: 10,
    });

    // Degradar a StoreUser: isOwnerAdmin false en el auth-store hidratado.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('currentUser');
      if (!raw) return;
      try {
        const current = JSON.parse(raw);
        if (current?.user) current.user.isOwnerAdmin = false;
        else current.isOwnerAdmin = false;
        window.localStorage.setItem('currentUser', JSON.stringify(current));
      } catch {
        /* leave as-is */
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-actions-toggle-${purchaseId}`)).toHaveCount(0);
  });

  test('E-R10: historial distingue reversas (badge + icono propio, F5)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R10');
    await purchaseIn(page, 'Almacén R10', product, '6', '15');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 6,
      costPrice: 15,
    });

    await openMovementsToday(page);
    const before = await page.locator('[data-testid^="mv-reversal-icon-"]').count();
    await revertFromHistory(page, purchaseId);

    await openMovementsToday(page);
    // La fila reversal nueva existe con icono violeta (clase text-violet-600).
    const reversalIcon = page.locator('[data-testid^="mv-reversal-icon-"], [data-testid^="mv-type-icon-"].text-violet-600');
    expect(await reversalIcon.count()).toBeGreaterThan(before);
    // El badge del original es visible.
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toBeVisible();
  });

  test('E-R11: sync round-trip lleva la reversa (F7)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R11');
    await purchaseIn(page, 'Almacén R11', product, '9', '12');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 9,
      costPrice: 12,
    });
    await revertFromHistory(page, purchaseId);

    // Export → limpiar entidades de almacenes → import → la reversa sobrevive.
    const zip = await exportBackupZip(page, 'e2e-mr-r11.zip');
    await page.evaluate((sid) => {
      localStorage.removeItem(`lizoft.store-warehouse-stock-movements-${sid}`);
    }, selectedStoreId);
    await importBackupZip(page, zip, 'e2e-mr-r11.zip');

    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toBeVisible();
  });

  test('E-R12: confirmación cancelada (No) no cambia nada', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R12');
    await purchaseIn(page, 'Almacén R12', product, '7', '22');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 7,
      costPrice: 22,
    });

    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-revert-${purchaseId}`).click();
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await page.waitForTimeout(400);

    // Sin badge, sin reversa, stock intacto.
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toHaveCount(0);
    expect(await onHandOf(page, 'Almacén R12')).toBe('7');
  });

  test('E-R14: reversa de compra con lote parcial (D9)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R14');
    await createWarehouse(page, 'Destino R14');
    await purchaseIn(page, 'Almacén R14', product, '10', '30');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 30,
    });
    // Transfiere 4 — el lote queda parcial (6 restantes).
    await transferOut(page, 'Almacén R14', '4', 'Destino R14');

    await revertFromHistory(page, purchaseId);

    // La reversa devuelve SOLO las 6 restantes → stock 0 en el origen.
    expect(await onHandOf(page, 'Almacén R14')).toBe('0');
    expect(await onHandOf(page, 'Destino R14')).toBe('4');
  });

  test('E-R14b: reversa de compra con lote consumido bloquea', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R14b');
    await purchaseIn(page, 'Almacén R14b', product, '10', '30');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 30,
    });
    // Salida total — el lote queda consumido.
    await saleOut(page, 'Almacén R14b', '10');

    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-revert-${purchaseId}`).click();
    await page.getByRole('button', { name: 'Si', exact: true }).click();
    await expect(page.getByText(PURCHASE_LOT_CONSUMED)).toBeVisible();
    await dismissSwal(page);

    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toHaveCount(0);
    expect(await onHandOf(page, 'Almacén R14b')).toBe('0');
  });

  test('E-R17: salida multi-lote crea dos filas y dos entradas de tienda (D8)', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R17');
    await purchaseIn(page, 'Almacén R17', product, '10', '5');
    await purchaseIn(page, 'Almacén R17', product, '10', '10');
    // Salida de 15: consume 10@$5 + 5@$10 → DOS filas.
    await saleOut(page, 'Almacén R17', '15');

    // Historial: dos filas de salida con sus costos exactos.
    const saleA = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 10,
      costPrice: 5,
    });
    const saleB = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 5,
      costPrice: 10,
    });
    expect(saleA).not.toBe(saleB);
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-qty-${saleA}`)).toBeVisible();
    await expect(page.getByTestId(`mv-qty-${saleB}`)).toBeVisible();

    // El almacén queda con 5@$10.
    expect(await onHandOf(page, 'Almacén R17')).toBe('5');
  });

  test('E-R17b: transferencia multi-lote acredita lotes exactos (D8)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'A R17b');
    await createWarehouse(page, 'B R17b');
    await purchaseIn(page, 'A R17b', product, '10', '5');
    await purchaseIn(page, 'A R17b', product, '10', '10');
    await transferOut(page, 'A R17b', '15', 'B R17b');

    // Dos filas de transferencia con costos exactos.
    const trA = await latestMovementId(page, selectedStoreId, {
      type: 'transfer_out',
      quantity: 10,
      costPrice: 5,
    });
    const trB = await latestMovementId(page, selectedStoreId, {
      type: 'transfer_out',
      quantity: 5,
      costPrice: 10,
    });
    expect(trA).not.toBe(trB);

    // A queda con 5@$10; B con 15 unidades (display ponderado $6.67).
    expect(await onHandOf(page, 'A R17b')).toBe('5');
    expect(await onHandOf(page, 'B R17b')).toBe('15');
  });

  test('E-R17c: costo exacto a la tienda — venta FIFO multi-lote (D8)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R17c');
    await purchaseIn(page, 'Almacén R17c', product, '10', '5');
    await purchaseIn(page, 'Almacén R17c', product, '10', '10');
    await saleOut(page, 'Almacén R17c', '15');

    // La venta consume FIFO: primero la entrada de 10@$5. El precio de venta
    // del producto de la persona es 700 — ganancia = 700 − 5 para 1 unidad.
    await createSaleOfFirstProduct(page);
    // El pin es que la venta FUNCIONA con la entrada multi-lote (dos entradas
    // activas) y consume la de $5 primero — hoy el almacén quedó en 5@$10.
    expect(await onHandOf(page, 'Almacén R17c')).toBe('5');
  });

  test('E-R17d: reversa de UNA fila multi-lote (D10)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R17d');
    await purchaseIn(page, 'Almacén R17d', product, '10', '5');
    await purchaseIn(page, 'Almacén R17d', product, '10', '10');
    await saleOut(page, 'Almacén R17d', '15');
    const saleB = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 5,
      costPrice: 10,
    });

    // Revertir SOLO la fila de 5@$10.
    await revertFromHistory(page, saleB);

    // El almacén re-acredita 5@$10 → 10 unidades; la fila de 10@$5 intacta.
    expect(await onHandOf(page, 'Almacén R17d')).toBe('10');
    await openMovementsToday(page);
    const saleA = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 10,
      costPrice: 5,
    });
    await expect(page.getByTestId(`mv-reversal-badge-${saleA}`)).toHaveCount(0);
  });

  test('E-R17e: edición de una fila multi-lote (D10)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R17e');
    await purchaseIn(page, 'Almacén R17e', product, '10', '5');
    await purchaseIn(page, 'Almacén R17e', product, '10', '10');
    await saleOut(page, 'Almacén R17e', '15');
    const saleB = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 5,
      costPrice: 10,
    });

    // Editar SOLO la fila de 5@$10 a 3 unidades.
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${saleB}`).click();
    await page.getByTestId(`mv-edit-${saleB}`).click();
    await page.getByTestId('movement-quantity').fill('3');
    await page.getByRole('button', { name: SAVE }).click();

    // Stock: 10@$5 salieron + 3@$10 salieron → 0 + 7 restantes del lote $10.
    expect(await onHandOf(page, 'Almacén R17e')).toBe('7');
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${saleB}`)).toBeVisible();
  });
});
