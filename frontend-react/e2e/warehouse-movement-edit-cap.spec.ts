import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Tope de edición de una compra — E2E (plan 2026-09-16, Fase 2 A1/A9d/A9e).
 *
 * Spec NUEVO creado por la Fase 2. La cobertura del tope NO podía vivir en
 * `movement-reversal.spec.ts`: ese spec es intocable, y su E-R5 se editó en
 * Fase 2 (con autorización explícita del usuario) para usar una cantidad
 * legal — su propósito es la reversa + recreación + badge, no el tope.
 *
 * Contrato verificado aquí:
 *   E-UI-1  El modal de edición de una compra precarga lo que QUEDA del lote
 *           (no la cantidad original) y anuncia el tope.
 *   E-UI-2  Una cantidad por encima del tope queda bloqueada: Guardar no
 *           ejecuta nada, no hay reversa, y el stock no cambia.
 *   E-UI-3  Dentro del tope la edición sí funciona (reversa + recreación).
 *
 * Los helpers replican los de `movement-reversal.spec.ts` / `warehouses.spec.ts`
 * (ambos intocables): enableWarehouseFeatures/openWarehouses/createWarehouse/
 * purchaseIn/saleOut/openMovementsToday/onHandOf/localTodayKey.
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE

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

/**
 * Reads a warehouse movement row id from localStorage (the encrypted storage is
 * transparent to the page context). Returns the LATEST movement matching the
 * predicate.
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

test.describe.serial('Tope de edición de una compra (A1)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('E-UI-2: una cantidad por encima del tope queda bloqueada y no toca el stock', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén TOPE');
    await purchaseIn(page, 'Almacén TOPE', product, '10', '50');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });

    // El lote está intacto: el tope es 10 (lo que queda).
    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-edit-${purchaseId}`).click();
    await expect(page.getByTestId('movement-max-hint')).toBeVisible();
    await expect(page.getByTestId('movement-max-hint')).toContainText('10');
    // A1: la precarga es lo que queda (10), no una cantidad inventada.
    await expect(page.getByTestId('movement-quantity')).toHaveValue('10');

    // 15 > tope → Guardar queda deshabilitado y aparece el aviso inline.
    await page.getByTestId('movement-quantity').fill('15');
    await expect(page.getByTestId('movement-max-error')).toBeVisible();
    await expect(page.getByRole('button', { name: SAVE })).toBeDisabled();

    // La fila original NO lleva badge: no hubo reversa.
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toHaveCount(0);
    expect(await onHandOf(page, 'Almacén TOPE')).toBe('10');
  });

  test('E-UI-1: tras consumir el lote, el tope es lo que QUEDA (no la cantidad original)', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén PARCIAL');
    await purchaseIn(page, 'Almacén PARCIAL', product, '10', '50');
    // Sale 4 al almacén... la merma va por salida; el lote baja a 6.
    await saleOut(page, 'Almacén PARCIAL', '4');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });

    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-edit-${purchaseId}`).click();
    // La fila dice 10, pero solo quedan 6: precargar 10 recrearía de más.
    await expect(page.getByTestId('movement-quantity')).toHaveValue('6');
    await expect(page.getByTestId('movement-max-hint')).toContainText('6');

    // 7 > 6 → bloqueado.
    await page.getByTestId('movement-quantity').fill('7');
    await expect(page.getByTestId('movement-max-error')).toBeVisible();
    await expect(page.getByRole('button', { name: SAVE })).toBeDisabled();
  });

  test('E-UI-3: dentro del tope la edición completa reversa + recreación', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    const product = await firstProductName(page, selectedStoreId);

    await createWarehouse(page, 'Almacén OK');
    await purchaseIn(page, 'Almacén OK', product, '10', '50');
    const purchaseId = await latestMovementId(page, selectedStoreId, {
      type: 'purchase_in',
      quantity: 10,
      costPrice: 50,
    });

    await openMovementsToday(page);
    await page.getByTestId(`mv-actions-toggle-${purchaseId}`).click();
    await page.getByTestId(`mv-edit-${purchaseId}`).click();
    // 6 está dentro del tope (10) → Guardar habilitado.
    await page.getByTestId('movement-quantity').fill('6');
    await page.getByTestId('movement-cost').fill('70');
    await expect(page.getByRole('button', { name: SAVE })).toBeEnabled();
    await page.getByRole('button', { name: SAVE }).click();

    // Original con badge + stock neto 6 (reversa + recreación).
    await openMovementsToday(page);
    await expect(page.getByTestId(`mv-reversal-badge-${purchaseId}`)).toBeVisible();
    expect(await onHandOf(page, 'Almacén OK')).toBe('6');
  });
});
