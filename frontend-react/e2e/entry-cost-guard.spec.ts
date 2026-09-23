import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Guarda de costo de una entrada de inventario — E2E (plan 2026-09-16, A8).
 *
 * Spec NUEVO. Ningún spec existente se modifica.
 *
 * Contrato verificado aquí:
 *   E-CG-1  Una entrada que NACIÓ de una salida de almacén (lleva
 *           `warehouseSaleOutMovementId`) no se puede editar en la tienda: el
 *           modal muestra el aviso de que el costo se actualiza en el almacén,
 *           el input de costo queda deshabilitado, el botón de guardado queda
 *           deshabilitado y el costo almacenado no cambia.
 *   E-CG-2  Una entrada NORMAL creada por el modal "+ Entrada" SÍ permite
 *           editar el costo (input habilitado, sin aviso, y el cambio persiste).
 *
 * Los helpers replican el patrón local de `warehouse-cost-propagation.spec.ts`
 * (enableWarehouseFeatures/openWarehouses/createWarehouse/purchaseIn/saleOut/
 * selectMovementProduct/openGearMovement/localTodayKey/latestMovementId/
 * firstProductName) — los specs de almacén existentes son intocables, así que
 * los helpers se copian localmente en vez de importarse.
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const ENTRIES_HEADER = 'Entradas del día'; // INVENTORY.TODAY_ENTRIES.TITLE
const NEW_ENTRY_TITLE = 'Adicionar Entrada'; // INVENTORY_ENTRY.NEW_INVENTORY_ENTRY
const EDIT_ENTRY_TITLE = 'Editar Entrada'; // INVENTORY_ENTRY.EDIT_INVENTORY_ENTRY
const ENTRY_BUTTON = 'Entrada'; // GENERAL.ENTRY
const INSERT_BUTTON = 'Adicionar'; // GENERAL.INSERT
const UPDATE_BUTTON = 'Actualizar'; // GENERAL.UPDATE
const EDIT_MENU_ITEM = 'Editar'; // GENERAL.EDIT
// INVENTORY_ENTRY.WAREHOUSE_COST_NOT_EDITABLE
const WAREHOUSE_COST_MESSAGE =
  'El costo de esta entrada se actualiza en el almacén, no se puede editar en la tienda.';

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

/** Reads the first sellable product's id + name from the persona's localStorage. */
async function firstProduct(
  page: Page,
  storeId: string,
): Promise<{ id: string; name: string }> {
  const result = await page.evaluate((sid) => {
    const raw = localStorage.getItem(`lizoft.store-products-${sid}`);
    if (!raw) return null;
    try {
      const entries = JSON.parse(raw) as [string, Record<string, unknown>][];
      const sellable = entries.find(([, p]) => p['isActive'] && p['availableToSale']);
      if (!sellable) return null;
      return { id: sellable[0], name: (sellable[1]['name'] as string) ?? '' };
    } catch {
      return null;
    }
  }, storeId);
  expect(result).not.toBeNull();
  return result!;
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

/** Reads the store entry id created by the given `sale_out` movement id. */
async function storeEntryIdOfSaleOut(
  page: Page,
  storeId: string,
  saleOutMovementId: string,
): Promise<string> {
  const id = await page.evaluate(
    ({ sid, movementId }) => {
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${sid}`);
      if (!raw) return '';
      try {
        const buckets = JSON.parse(raw) as Array<[string, Array<Record<string, unknown>>]>;
        for (const [, entries] of buckets) {
          const found = entries.find((e) => e['warehouseSaleOutMovementId'] === movementId);
          if (found) return (found['id'] as string) ?? '';
        }
        return '';
      } catch {
        return '';
      }
    },
    { sid: storeId, movementId: saleOutMovementId },
  );
  expect(id).not.toBe('');
  return id;
}

/** Reads a stored entry (by id) across every product bucket, or null. */
async function readEntry(
  page: Page,
  storeId: string,
  entryId: string,
): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    ({ sid, eid }) => {
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${sid}`);
      if (!raw) return null;
      try {
        const buckets = JSON.parse(raw) as Array<[string, Array<Record<string, unknown>>]>;
        for (const [, entries] of buckets) {
          const found = entries.find((e) => e['id'] === eid);
          if (found) return found;
        }
        return null;
      } catch {
        return null;
      }
    },
    { sid: storeId, eid: entryId },
  );
}

/** Active entry ids for a product — used to diff the id a UI creation produced. */
async function activeEntryIdsForProduct(
  page: Page,
  storeId: string,
  productId: string,
): Promise<string[]> {
  return page.evaluate(
    ({ sid, pid }) => {
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${sid}`);
      if (!raw) return [];
      try {
        const buckets = JSON.parse(raw) as Array<[string, Array<Record<string, unknown>>]>;
        const bucket = buckets.find(([id]) => id === pid);
        return bucket
          ? bucket[1].filter((e) => e['isActive']).map((e) => e['id'] as string)
          : [];
      } catch {
        return [];
      }
    },
    { sid: storeId, pid: productId },
  );
}

async function navigateToEntries(page: Page): Promise<void> {
  await page.goto('/inventory/today-entries');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(ENTRIES_HEADER)).toBeVisible();
}

/** Opens the new-entry modal and creates a normal entry for `productName`. */
async function createNormalEntry(
  page: Page,
  productName: string,
  quantity: string,
  cost: string,
): Promise<void> {
  await page.getByRole('button', { name: ENTRY_BUTTON }).click();
  await expect(page.getByText(NEW_ENTRY_TITLE)).toBeVisible();
  const productInput = page.locator('#entry-product');
  await productInput.fill(productName);
  const option = page.locator('[role="option"]').first();
  await expect(option).toBeVisible();
  await option.click();
  await page.locator('#entry-quantity').fill(quantity);
  await page.locator('#entry-cost-price').fill(cost);
  await page.getByRole('button', { name: INSERT_BUTTON }).click();
  await expect(page.getByText(NEW_ENTRY_TITLE)).toHaveCount(0);
}

/** Opens the action menu of a row (by entry id) and clicks "Editar". */
async function openEditForEntry(page: Page, entryId: string): Promise<void> {
  await page.getByTestId(`entry-actions-toggle-${entryId}`).click();
  await page.getByRole('menuitem', { name: EDIT_MENU_ITEM }).click();
  await expect(page.getByText(EDIT_ENTRY_TITLE)).toBeVisible();
}

test.describe.serial('A8 — Guarda de costo de entradas de almacén en la tienda', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('E-CG-1: una entrada de almacén no permite editar el costo en la tienda', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProduct(page, selectedStoreId);

    await createWarehouse(page, 'Almacén GUARD');
    await purchaseIn(page, 'Almacén GUARD', product.name, '10', '50');
    await saleOut(page, 'Almacén GUARD', '4');
    const saleOutId = await latestMovementId(page, selectedStoreId, {
      type: 'sale_out',
      quantity: 4,
    });
    const mirrorEntryId = await storeEntryIdOfSaleOut(page, selectedStoreId, saleOutId);

    // La entrada espejo nace a $50 y sellada por la salida.
    expect((await readEntry(page, selectedStoreId, mirrorEntryId))?.['costPrice']).toBe(50);

    await navigateToEntries(page);
    await openEditForEntry(page, mirrorEntryId);

    // El aviso explica por qué el costo no se edita aquí.
    await expect(page.getByTestId('entry-warehouse-cost-message')).toBeVisible();
    await expect(page.getByText(WAREHOUSE_COST_MESSAGE)).toBeVisible();
    // El input de costo queda deshabilitado y el guardado también.
    await expect(page.locator('#entry-cost-price')).toBeDisabled();
    await expect(page.getByRole('button', { name: UPDATE_BUTTON })).toBeDisabled();

    // Nada se guardó: el costo almacenado sigue siendo 50.
    expect((await readEntry(page, selectedStoreId, mirrorEntryId))?.['costPrice']).toBe(50);
  });

  test('E-CG-2: una entrada normal SÍ permite editar el costo', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProduct(page, selectedStoreId);

    await navigateToEntries(page);
    const before = await activeEntryIdsForProduct(page, selectedStoreId, product.id);
    await createNormalEntry(page, product.name, '7', '50');
    const after = await activeEntryIdsForProduct(page, selectedStoreId, product.id);
    const createdId = after.find((id) => !before.includes(id));
    expect(createdId).toBeTruthy();

    await openEditForEntry(page, createdId!);

    // Sin aviso de almacén, el costo es editable.
    await expect(page.getByTestId('entry-warehouse-cost-message')).toHaveCount(0);
    await expect(page.locator('#entry-cost-price')).toBeEnabled();
    await expect(page.getByRole('button', { name: UPDATE_BUTTON })).toBeEnabled();

    // Y el cambio persiste.
    await page.locator('#entry-cost-price').fill('60');
    await page.getByRole('button', { name: UPDATE_BUTTON }).click();
    await expect(page.getByText(EDIT_ENTRY_TITLE)).toHaveCount(0);
    expect((await readEntry(page, selectedStoreId, createdId!))?.['costPrice']).toBe(60);
  });
});
