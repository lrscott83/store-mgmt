import { readFileSync } from 'node:fs';
import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Fase 4 — movimientos de almacén: E2E NUEVOS (plan 2026-09-16, §3 Fase 4).
 *
 * Spec NUEVO. Ningún spec existente se modifica. Casos:
 *   E-R7b  editar una transferencia cuando el destino ya no tiene stock → la
 *          reversa del paso 1 falla con stock insuficiente.
 *   E-R13  reversa duplicada por import → skip silencioso, sin duplicado.
 *   E-R15  reversa con un almacén desactivado involucrado → almacén no activo.
 *   E-R16  i18n: sin claves crudas visibles en las páginas de almacenes.
 *
 * Los helpers replican los de `movement-reversal.spec.ts` (intocable).
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const BACKUP_PASSWORD = 'WarehouseFase4E2E-123';
const IMPORT_SUCCESS = 'Los datos se importaron correctamente.'; // SYNC.IMPORT_SUCCESS
const REVERSAL_SUCCESS = 'Movimiento revertido.'; // WAREHOUSES.REVERSAL_SUCCESS
const INSUFFICIENT_STOCK = 'No hay suficiente stock en el almacén.'; // Warehouse.InsufficientStock
const WAREHOUSE_NOT_ACTIVE = 'El almacén involucrado no está activo.'; // Warehouse.WarehouseNotActive

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

async function transferOut(
  page: Page,
  warehouseName: string,
  quantity: string,
  targetName: string,
): Promise<void> {
  await openGearMovement(page, warehouseName, 'Movimiento');
  await selectMovementProduct(page);
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByTestId('movement-target').selectOption({ label: targetName });
  await page.getByRole('button', { name: SAVE }).click();
}

/** Dismisses a blocking Swal error dialog (default "OK"). */
async function dismissSwal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'OK' }).click();
  await page.waitForTimeout(300);
}

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

async function firstProductId(page: Page, storeId: string): Promise<string> {
  const id = await page.evaluate((sid) => {
    const raw = localStorage.getItem(`lizoft.store-products-${sid}`);
    if (!raw) return '';
    try {
      const entries = JSON.parse(raw) as [string, Record<string, unknown>][];
      const sellable = entries.find(([, p]) => p['isActive'] && p['availableToSale']);
      return sellable ? sellable[0] : '';
    } catch {
      return '';
    }
  }, storeId);
  expect(id).not.toBe('');
  return id;
}

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

/** Counts the persisted reversal rows that compensate `originalMovementId`. */
async function countReversalsOf(
  page: Page,
  storeId: string,
  originalMovementId: string,
): Promise<number> {
  return page.evaluate(
    ({ sid, orig }) => {
      const raw = localStorage.getItem(`lizoft.store-warehouse-stock-movements-${sid}`);
      if (!raw) return 0;
      try {
        const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
        return rows.filter(
          (r) => r['type'] === 'reversal' && r['reversalOfMovementId'] === orig,
        ).length;
      } catch {
        return 0;
      }
    },
    { sid: storeId, orig: originalMovementId },
  );
}

async function installToastObserver(page: Page, text: string): Promise<void> {
  await page.evaluate((target) => {
    const w = window as unknown as { __f4ToastSeen?: string };
    w.__f4ToastSeen = undefined;
    const root = document.body ?? document.documentElement;
    const observer = new MutationObserver(() => {
      if (w.__f4ToastSeen === undefined && root.textContent?.includes(target)) {
        w.__f4ToastSeen = target;
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }, text);
}

async function expectToastSeen(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as unknown as { __f4ToastSeen?: string }).__f4ToastSeen),
      { timeout: 15_000 },
    )
    .toBe(text);
}

async function revertFromHistory(page: Page, movementId: string): Promise<void> {
  await openMovementsToday(page);
  await installToastObserver(page, REVERSAL_SUCCESS);
  await page.getByTestId(`mv-actions-toggle-${movementId}`).click();
  await page.getByTestId(`mv-revert-${movementId}`).click();
  await page.getByRole('button', { name: 'Si', exact: true }).click();
  await expectToastSeen(page, REVERSAL_SUCCESS);
  await page.waitForTimeout(400);
}

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

test.describe.serial('Movimientos de almacén — Fase 4 (E2E nuevos)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('E-R7b: editar una transferencia sin stock en el destino falla con stock insuficiente', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R7b-A');
    await createWarehouse(page, 'Almacén R7b-B');
    await purchaseIn(page, 'Almacén R7b-A', product, '10', '50');
    // Mueve todo A → B, y luego saca todo de B: el destino queda en 0.
    await transferOut(page, 'Almacén R7b-A', '10', 'Almacén R7b-B');
    const transferId = await latestMovementId(page, selectedStoreId, {
      type: 'transfer_out',
      quantity: 10,
    });
    await saleOut(page, 'Almacén R7b-B', '10');

    // Editar la transferencia a 5: la reversa del paso 1 no encuentra stock en el destino.
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${transferId}`).click();
    await page.getByTestId(`mv-edit-${transferId}`).click();
    await page.getByTestId('movement-quantity').fill('5');
    await page.getByRole('button', { name: SAVE }).click();

    await expect(page.getByText(INSUFFICIENT_STOCK)).toBeVisible();
    await dismissSwal(page);
    // Sin reversa aplicada: la fila original no lleva badge.
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${transferId}`)).toHaveCount(0);
  });

  test('E-R13: re-importar un respaldo con la reversa ya aplicada no la duplica', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén R13');
    await purchaseIn(page, 'Almacén R13', product, '10', '50');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });
    await revertFromHistory(page, purchaseId);
    expect(await countReversalsOf(page, selectedStoreId, purchaseId)).toBe(1);

    // Exporta el respaldo con la reversa y lo re-importa: skip silencioso.
    const zip = await exportBackupZip(page, test.info().outputPath('r13-backup.zip'));
    await importBackupZip(page, zip, 'r13-backup.zip');

    expect(await countReversalsOf(page, selectedStoreId, purchaseId)).toBe(1);
    await openMovementsToday(page);
    // La fila original sigue con SU único badge (no hay duplicados de reversa).
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toBeVisible();
  });

  test('E-R15: revertir un movimiento de un almacén desactivado → almacén no activo', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const productId = await firstProductId(page, selectedStoreId);

    // Estado histórico: un almacén ya desactivado con un movimiento vivo (no
    // alcanzable por la UI — el guard de desactivación lo impide). Se siembra
    // directo el storage (mismo mecanismo que otros specs usan para inventario).
    await page.evaluate(
      ({ sid, productId: pid }) => {
        const now = new Date().toISOString();
        localStorage.setItem(
          `lizoft.store-warehouses-${sid}`,
          JSON.stringify([
            {
              id: 'wh-off',
              name: 'Almacén OFF',
              isActive: false,
              createdDate: now,
              createdByName: 'seed',
            },
          ]),
        );
        localStorage.setItem(
          `lizoft.store-warehouse-stock-movements-${sid}`,
          JSON.stringify([
            {
              id: 'mv-off',
              warehouseId: 'wh-off',
              productId: pid,
              type: 'purchase_in',
              quantity: 10,
              costPrice: 5,
              reason: null,
              createdDate: now,
              createdByName: 'seed',
            },
          ]),
        );
      },
      { sid: selectedStoreId, productId },
    );

    await openMovementsToday(page);
    await page.getByTestId('mv-actions-toggle-mv-off').click();
    await page.getByTestId('mv-revert-mv-off').click();
    await page.getByRole('button', { name: 'Si', exact: true }).click();

    await expect(page.getByText(WAREHOUSE_NOT_ACTIVE)).toBeVisible();
    await dismissSwal(page);
  });

  test('E-R16: i18n — las páginas de almacenes no muestran claves crudas', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;
    await enableWarehouseFeatures(page);

    const rawKey = /\b[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_.]*\b/;
    for (const route of ['/inventory/warehouses', '/inventory/warehouse-movements']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const text = await page.locator('body').innerText();
      expect(text).not.toContain('WAREHOUSES.');
      expect(rawKey.test(text)).toBe(false);
    }
  });
});
