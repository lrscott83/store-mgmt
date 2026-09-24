import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * Edición del costo de una entrada de tienda — E2E (plan 2026-09-16, Fase 3).
 *
 * Spec NUEVO. Ningún spec existente se modifica.
 *
 * Contrato verificado aquí:
 *   E-CP-1  Editar el costo de una entrada NORMAL (sin ventas) se guarda DIRECTO,
 *           sin diálogo de propagación, y el costo nuevo es lo que la fila de
 *           "Entradas del día" muestra después.
 *   E-CP-2  Una entrada que YA TIENE ventas (available < quantity) no se puede
 *           editar: la tienda la rechaza con su mensaje observable y el costo
 *           almacenado no cambia.
 *
 * Nota sobre el estado "vendido" de E-CP-2: la entrada se crea por el flujo real
 * del modal "+ Entrada" y luego su `available` se reduce a nivel de storage para
 * representar la venta. Se siembra así (mismo criterio que `inventory-egress.spec.ts`
 * para el stock) porque una venta real por FIFO consumiría primero las entradas
 * más antiguas del producto compartido de la persona, y el resultado no sería
 * determinista entre specs. La conducta que se verifica — el rechazo del guard
 * `isNotSoldEntry` con su mensaje — es la real.
 *
 * Los helpers replican el patrón local de `warehouse-cost-propagation.spec.ts`
 * (los specs existentes son intocables, así que se copian localmente).
 */

const ENTRIES_HEADER = 'Entradas del día'; // INVENTORY.TODAY_ENTRIES.TITLE
const NEW_ENTRY_TITLE = 'Adicionar Entrada'; // INVENTORY_ENTRY.NEW_INVENTORY_ENTRY
const EDIT_ENTRY_TITLE = 'Editar Entrada'; // INVENTORY_ENTRY.EDIT_INVENTORY_ENTRY
const ENTRY_BUTTON = 'Entrada'; // GENERAL.ENTRY
const INSERT_BUTTON = 'Adicionar'; // GENERAL.INSERT
const UPDATE_BUTTON = 'Actualizar'; // GENERAL.UPDATE
const EDIT_MENU_ITEM = 'Editar'; // GENERAL.EDIT
const PROPAGATION_TITLE = 'Propagar costo de la compra'; // WAREHOUSES.PROPAGATION_TITLE
// InventoryErrors.SaleExistsWithThisEntry.description
const SOLD_ENTRY_ERROR = 'Existe una venta que corresponde con esta entrada.';

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

/** Reduces an entry's `available` to represent a sale (quantity stays intact). */
async function markEntryAsPartiallySold(
  page: Page,
  storeId: string,
  productId: string,
  entryId: string,
  available: number,
): Promise<void> {
  const updated = await page.evaluate(
    ({ sid, pid, eid, avail }) => {
      const key = `lizoft.store-inventory-entries-${sid}`;
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      try {
        const buckets = JSON.parse(raw) as Array<[string, Array<Record<string, unknown>>]>;
        const bucket = buckets.find(([id]) => id === pid);
        if (!bucket) return false;
        const entry = bucket[1].find((e) => e['id'] === eid);
        if (!entry) return false;
        entry['available'] = avail;
        localStorage.setItem(key, JSON.stringify(buckets));
        return true;
      } catch {
        return false;
      }
    },
    { sid: storeId, pid: productId, eid: entryId, avail: available },
  );
  expect(updated).toBe(true);
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

test.describe.serial('Fase 3 — Costo de una entrada de tienda sin almacén', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('E-CP-1: editar el costo de una entrada sin ventas guarda directo y se refleja', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    const product = await firstProduct(page, selectedStoreId);

    await navigateToEntries(page);
    const before = await activeEntryIdsForProduct(page, selectedStoreId, product.id);
    await createNormalEntry(page, product.name, '8', '50');
    const after = await activeEntryIdsForProduct(page, selectedStoreId, product.id);
    const entryId = after.find((id) => !before.includes(id));
    expect(entryId).toBeTruthy();

    await openEditForEntry(page, entryId!);
    await page.locator('#entry-cost-price').fill('70');
    await page.getByRole('button', { name: UPDATE_BUTTON }).click();

    // Guarda directo: el modal se cierra y NO aparece el diálogo de propagación.
    await expect(page.getByText(EDIT_ENTRY_TITLE)).toHaveCount(0);
    await expect(page.getByText(PROPAGATION_TITLE)).toHaveCount(0);

    // El costo nuevo es lo que el sistema muestra y guarda.
    const row = page.locator('tr').filter({ has: page.getByTestId(`entry-actions-toggle-${entryId!}`) });
    await expect(row).toContainText('70');
    await expect(row).toContainText('CUP');
    expect((await readEntry(page, selectedStoreId, entryId!))?.['costPrice']).toBe(70);
  });

  test('E-CP-2: una entrada con ventas es rechazada y su costo no cambia', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    const product = await firstProduct(page, selectedStoreId);

    await navigateToEntries(page);
    const before = await activeEntryIdsForProduct(page, selectedStoreId, product.id);
    await createNormalEntry(page, product.name, '10', '50');
    const after = await activeEntryIdsForProduct(page, selectedStoreId, product.id);
    const entryId = after.find((id) => !before.includes(id));
    expect(entryId).toBeTruthy();

    // Estado "vendido": 2 unidades fuera de las 10 de la entrada.
    await markEntryAsPartiallySold(page, selectedStoreId, product.id, entryId!, 8);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await openEditForEntry(page, entryId!);
    await page.locator('#entry-cost-price').fill('70');
    await page.getByRole('button', { name: UPDATE_BUTTON }).click();

    // La tienda rechaza la edición con su mensaje observable y el modal sigue abierto.
    await expect(page.getByText(SOLD_ENTRY_ERROR)).toBeVisible();
    await expect(page.getByText(EDIT_ENTRY_TITLE)).toBeVisible();
    // El costo almacenado no cambió.
    expect((await readEntry(page, selectedStoreId, entryId!))?.['costPrice']).toBe(50);
  });
});
