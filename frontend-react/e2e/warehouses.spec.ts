import { readFileSync } from 'node:fs';
import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { E2E_API_URL } from './support/backend-url';
import { readBearerToken } from './support/auth-storage';
import { newTestIdentity } from './support/identity';

/**
 * Almacenes — E2E Playwright (plan 2026-09-04-warehouses-plan.md)
 *
 * Cubre el flujo completo de gestión de almacenes:
 *   1. Crear almacén + entrada por compra (purchase_in) → stock visible.
 *   2. Salida a tienda (sale_out) → debita el almacén y crea una entrada en
 *      Entradas del día.
 *   3. sale_out con stock insuficiente → error, sin entrada creada.
 *   4. Transferencia almacén A → B → stock A decrece, stock B crece.
 *   6. Desactivar almacén con stock → bloqueado (Swal); vacío → (Inactivo).
 *   7. Cantidad decimal (10.555 → 10.56) en purchase_in/sale_out con round2.
 *   8. Exportar/importar backup /sync con las 3 entidades de almacenes.
 *   9. Ítem de menú Almacenes: la persona nueva ya trae el feature Warehouses
 *       (36) por defecto (módulo 13), así que el gating se prueba con el seam
 *       inverso (quita 36 → oculto, re-agrega → visible); el gate por rol lo
 *       cubre el test 11.
 *   10. Regresión venta: FIFO con el costo del almacén en today-sales-profit.
 *   11. Acceso por rol: un StoreUser (empleado, rol 3) no ve el ítem de menú y
 *      la ruta /inventory/warehouses lo desloguea (Warehouses es OwnerAdmin-only
 *      en StoreRoleFeatures.cs:86-89; featureLoader sin bypass para StoreUser).
 *
 * El módulo 13 (Add-Warehouses-Module, 2026-09-05/06) asigna Warehouses (36) a
 * toda tienda nueva en runtime, así que la persona OwnerAdmin ya lo trae. El
 * seam fuerza 36/31 en `currentUser` (featureIds Y roles[].featureIds) en
 * localStorage y recarga: en cold boot la app hidrata `user` desde currentUser
 * (auth-store.ts:161-178) y la sidebar autoriza vía isUserAuthorized, que además
 * del featureIds top-level chequea roles[].featureIds
 * (authorization-service.ts:35-38) — por eso el seam toca ambos. El test de
 * gating lo QUITA primero para probar que el ítem se oculta sin él, y luego lo
 * vuelve a habilitar.
 *
 * ACTUALIZADO 2026-09-08 (autorizado por el usuario en persona): el rediseño
 * 2026-09-07 de warehouses.tsx (paneles colapsables por categoría, commits
 * 8cd0959d → c928b104) eliminó la compra rápida por fila (purchase-select-),
 * las celdas stock-onhand-/stock-cost- y los botones por fila; compra,
 * transferencia y salida pasaron al menú de engranaje (Entrada / Movimiento /
 * Salida) + WarehouseMovementModal. Los helpers fueron reescritos contra esa
 * UI. El stock ahora se lee de la fila de producto del panel expandido
 * ("Nombre (N)") y el costo de warehouse-product-cost- con formatCurrency.
 * La cobertura extendida (GAP-3, atomicidad) vive en
 * warehouse-movements-extended.spec.ts (spec NUEVO, plan 2026-09-08).
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const INSUFFICIENT_STOCK = 'No hay suficiente stock en el almacén.'; // Warehouse.InsufficientStock
const TODAY_ENTRIES_TITLE = 'Entradas del día'; // INVENTORY.TODAY_ENTRIES.TITLE
const CANNOT_DEACTIVATE = 'No se puede desactivar un almacén con stock o movimientos.'; // Warehouse.CannotDeactivate
const INACTIVE_TAG = '(Inactivo)'; // WAREHOUSES.INACTIVE (rendered "(Inactivo)" in warehouses.tsx:277)
const IMPORT_SUCCESS = 'Los datos se importaron correctamente.'; // SYNC.IMPORT_SUCCESS
const ORDER_CREATED = 'La venta fue creada satisfactoriamente.'; // ORDERS.CREATED (create-sale pattern)
const BACKUP_PASSWORD = 'WarehouseE2E-123';
const SALE_PAYMENT_LABEL = 'Pago'; // /sales/new payment input (inventory-profit.spec.ts:66)
const PROFIT_HEADER = 'Ganancias del Día'; // INVENTORY.PROFIT.TITLE
const ALL_CATEGORIES = 'Todos'; // /sales/new category filter (inventory-profit.spec.ts:17)

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

/** Removes ONLY the Warehouses feature (36) from the restored persona and reloads. */
async function disableWarehouseFeatures(page: Page): Promise<void> {
  await page.evaluate(() => {
    const withoutWarehouses = (featureIds: number[] | undefined): number[] =>
      (featureIds ?? []).filter((id) => id !== 36);

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.includes('authf496fc5a9f17')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const model = JSON.parse(raw);
        if (model && Array.isArray(model.featureIds)) {
          model.featureIds = withoutWarehouses(model.featureIds);
        }
        if (model?.user && Array.isArray(model.user.featureIds)) {
          model.user.featureIds = withoutWarehouses(model.user.featureIds);
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
          current.featureIds = withoutWarehouses(current.featureIds);
        }
        // Same reason as enableWarehouseFeatures: isUserAuthorized grants via
        // roles[].featureIds too, so strip 36 from every role row as well.
        if (current && Array.isArray(current.roles)) {
          for (const role of current.roles) {
            if (role && Array.isArray(role.featureIds)) {
              role.featureIds = withoutWarehouses(role.featureIds);
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
 * Authorized adaptation (2026-09-10): warehouses.spec.ts decimal + backup tests.
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

/**
 * Expands a warehouse's panel (and its first category when present) so the
 * product rows render, and returns the warehouse's product-row locator.
 * Post-2026-09-07 UI: stock lives inside the collapsible category panel.
 * Idempotent — reads aria-expanded before clicking, so a second call on an
 * already-expanded panel does not collapse it.
 */
async function expandWarehouseProducts(
  page: Page,
  warehouseName: string,
): Promise<ReturnType<Page['locator']>> {
  const card = warehouseCard(page, warehouseName);
  const toggle = card.locator(`[data-testid^="warehouse-toggle-"]`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  // Expand the first category (persona store has a single category). NOTE:
  // expandedCategories is keyed by categoryId and shared across warehouses, so
  // the same category opened in one panel renders expanded in another.
  const categoryToggle = card.locator(`[data-testid^="warehouse-category-toggle-"]`).first();
  await expect(categoryToggle).toBeVisible();
  if ((await categoryToggle.getAttribute('aria-expanded')) !== 'true') {
    await categoryToggle.click();
  }
  const row = card.locator('[data-testid^="warehouse-product-row-"]').first();
  await expect(row).toBeVisible();
  return row;
}

/** Reads the first product row's onHand — the "(N)" in "Name (N)". */
async function onHandCell(page: Page, warehouseName: string): Promise<string> {
  const row = await expandWarehouseProducts(page, warehouseName);
  const text = await row.locator('p.font-medium').innerText();
  const match = /\(([-\d.]+)\)$/.exec(text.trim());
  return match ? match[1] : text.trim();
}

/** Reads the first product row's avg cost — formatCurrency, e.g. "$660" / "$7.33". */
async function costCell(page: Page, warehouseName: string): Promise<string> {
  const row = await expandWarehouseProducts(page, warehouseName);
  return (await row.locator('[data-testid^="warehouse-product-cost-"]').innerText()).trim();
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
 * Opens the warehouse's gear menu and clicks a movement item (post-2026-09-07
 * UI): 'Entrada' → purchase_in modal, 'Movimiento' → transfer_out modal,
 * 'Salida' → sale_out modal. The modal opens with a blank product select.
 */
async function openGearMovement(page: Page, warehouseName: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `Acciones de ${warehouseName}` }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Purchase via gear → Entrada: picks the product, fills quantity + cost, saves. */
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

/** Sale out via gear → Salida: picks the first stocked product and saves. */
async function saleOut(page: Page, warehouseName: string, quantity: string): Promise<void> {
  await openGearMovement(page, warehouseName, 'Salida');
  // Gear mode opens the modal with a BLANK product select — the modal lists
  // only stocked products, so the first option after the placeholder is the
  // (only) product this suite stocks in the warehouse.
  await page.getByTestId('movement-product').selectOption({ index: 1 });
  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByRole('button', { name: SAVE }).click();
}

/** Dismisses a blocking Swal error dialog (stockSweetAlert default "OK" button). */
async function dismissSwal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'OK' }).click();
  await page.waitForTimeout(300); // Swal unmount animation
}

/**
 * Success-toast observer (sync-export-import-v2.spec.ts pattern): the toast
 * auto-closes in ~1s, so a MutationObserver records the text the instant it
 * lands in the DOM and expect.poll reads the flag.
 */
async function installToastObserver(page: Page, text: string): Promise<void> {
  await page.evaluate((target) => {
    const w = window as unknown as { __whToastSeen?: string };
    w.__whToastSeen = undefined;
    const root = document.body ?? document.documentElement;
    const observer = new MutationObserver(() => {
      if (w.__whToastSeen === undefined && root.textContent?.includes(target)) {
        w.__whToastSeen = target;
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
          const w = window as unknown as { __whToastSeen?: string };
          return w.__whToastSeen;
        });
        return seen === text;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

/**
 * Export-import round trip via the real /sync UI (sync-export-import-v2.spec.ts
 * pattern): exports a password-protected ZIP from /sync/export and re-imports
 * it on /sync/import on the same page.
 */
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

/** Opens the sidebar (collapsed by default, app-layout.tsx:28) via its navbar toggle. */
async function openSidebar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Alternar barra lateral' }).click();
}

/**
 * The Warehouses menu link — rendered by the sidebar only when feature 36 is
 * authorized (sidebar.tsx filters via isUserAuthorized, which has NO
 * owner-admin bypass). Matched by href: deterministic regardless of how the
 * icon + label spans compose the accessible name.
 */
function warehousesMenuLink(page: Page): ReturnType<Page['locator']> {
  return page.locator('a[href="/inventory/warehouses"]');
}

/** Creates a sale of 1 unit of the first sellable product via the real /sales/new UI. */
async function createSaleOfFirstProduct(page: Page): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: ALL_CATEGORIES }).click();
  const addBtn = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.getByTestId('cart-badge')).toHaveText('1');
  await page.getByTestId('cart-badge').locator('..').click();
  const paymentInput = page.getByRole('spinbutton', { name: SALE_PAYMENT_LABEL });
  await paymentInput.fill('10');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(ORDER_CREATED)).toBeVisible();
}

/** Reads the total profit from /inventory/today-sales-profit (compact format, e.g. "$4" / "-$650"). */
async function readTotalProfit(page: Page): Promise<string> {
  await page.goto('/inventory/today-sales-profit');
  await expect(page.getByText(PROFIT_HEADER)).toBeVisible();
  // The Card title's total span (today-sales-profit.tsx:218) — text-lg font-bold
  // text-success; the text-success class disambiguates from the sidebar's own
  // text-lg font-bold "VendeDTo" brand span should the sidebar ever be open.
  return (await page.locator('span.text-lg.font-bold.text-success').first().innerText()).trim();
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

    await purchaseIn(page, 'Almacén Central', product, '24', '660');

    // Stock visible: on-hand 24 y costo 660 en la fila del producto.
    expect(await onHandCell(page, 'Almacén Central')).toBe('24');
    expect(await costCell(page, 'Almacén Central')).toBe('$660');
  });

  test('salida a tienda debita el almacén y crea una entrada en Entradas del día', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Central');
    const product = await firstProductName(page, selectedStoreId);
    await purchaseIn(page, 'Central', product, '24', '660');
    expect(await onHandCell(page, 'Central')).toBe('24');

    // Salida a tienda de 12 unidades.
    await openGearMovement(page, 'Central', 'Salida');
    await page.getByTestId('movement-product').selectOption({ label: product });
    await page.getByTestId('movement-quantity').fill('12');
    await page.getByTestId('movement-reason').fill('pedido tienda');
    await page.getByRole('button', { name: SAVE }).click();

    // El almacén queda con 12.
    expect(await onHandCell(page, 'Central')).toBe('12');

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
    await purchaseIn(page, 'Central', product, '5', '660');
    expect(await onHandCell(page, 'Central')).toBe('5');

    await openGearMovement(page, 'Central', 'Salida');
    await page.getByTestId('movement-product').selectOption({ label: product });
    await page.getByTestId('movement-quantity').fill('6');
    await page.getByRole('button', { name: SAVE }).click();

    // Error de stock visible (Swal) — el almacén sigue con 5.
    await expect(page.getByText(INSUFFICIENT_STOCK)).toBeVisible();
    // The movement modal STAYS OPEN on failure (warehouses.tsx closes it only
    // on success) — dismiss the Swal, then close the modal.
    await dismissSwal(page);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('movement-form-sale_out')).toHaveCount(0);
    expect(await onHandCell(page, 'Central')).toBe('5');

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
    await purchaseIn(page, 'Almacén A', product, '24', '660');
    expect(await onHandCell(page, 'Almacén A')).toBe('24');

    // Transferir 10 de A → B (gear → Movimiento).
    await openGearMovement(page, 'Almacén A', 'Movimiento');
    await page.getByTestId('movement-product').selectOption({ label: product });
    await page.getByTestId('movement-quantity').fill('10');
    await page.getByTestId('movement-target').selectOption({ label: 'Almacén B' });
    await page.getByRole('button', { name: SAVE }).click();

    // A queda con 14.
    expect(await onHandCell(page, 'Almacén A')).toBe('14');

    // B recibe 10 con el costo propagado (660).
    expect(await onHandCell(page, 'Almacén B')).toBe('10');
    expect(await costCell(page, 'Almacén B')).toBe('$660');
  });

  test('desactivar almacén con stock se bloquea y almacén vacío sí se desactiva', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    // Almacén CON stock: crear + comprar 24.
    await createWarehouse(page, 'Con Stock');
    const product = await firstProductName(page, selectedStoreId);
    await purchaseIn(page, 'Con Stock', product, '24', '660');
    expect(await onHandCell(page, 'Con Stock')).toBe('24');

    // Intentar desactivar → Swal con CannotDeactivate, el almacén sigue activo.
    // (2026-09-06 UI redesign: "Desactivar" lives in the per-warehouse gear menu
    //  now — open it first, then click the menuitem. Authorized adaptation.)
    await page.getByRole('button', { name: 'Acciones de Con Stock' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await expect(page.getByText(CANNOT_DEACTIVATE)).toBeVisible();
    await dismissSwal(page);
    await expect(page.getByTestId('warehouse-card-Con Stock')).toBeVisible();
    await expect(page.getByTestId('warehouse-card-Con Stock').getByText(INACTIVE_TAG)).toHaveCount(
      0,
    );

    // Almacén VACÍO (sin stock ni movimientos): sí se desactiva → (Inactivo).
    await createWarehouse(page, 'Vacío');
    await page.getByRole('button', { name: 'Acciones de Vacío' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await expect(page.getByTestId('warehouse-card-Vacío').getByText(INACTIVE_TAG)).toBeVisible();
  });

  test('cantidad decimal se acepta con round2 en compra y salida', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    await createWarehouse(page, 'Decimal');
    const product = await firstProductName(page, selectedStoreId);

    // purchase_in de 10.555 → onHand 10.56 (round2).
    await purchaseIn(page, 'Decimal', product, '10.555', '100');
    expect(await onHandCell(page, 'Decimal')).toBe('10.56');

    // El movimiento registra la cantidad redondeada (10.56).
    await openMovementsToday(page);
    await expect(page.locator('[data-testid^="mv-qty-"]').first()).toHaveText('10.56');
    await openWarehouses(page);

    // sale_out de 2.5 → almacén queda en 8.06 y la entrada de la tienda se crea.
    await saleOut(page, 'Decimal', '2.5');
    expect(await onHandCell(page, 'Decimal')).toBe('8.06');

    // La InventoryEntry de la tienda quedó persistida con quantity 2.5.
    const entryQty = await page.evaluate((sid) => {
      const raw = localStorage.getItem(`lizoft.store-inventory-entries-${sid}`);
      if (!raw) return null;
      try {
        const buckets = JSON.parse(raw) as [string, Record<string, unknown>[]][];
        const entries = buckets.flatMap(([, es]) => es);
        const today = entries.filter(
          (e) => typeof e['quantity'] === 'number' && (e['quantity'] as number) === 2.5,
        );
        return today.length;
      } catch {
        return null;
      }
    }, selectedStoreId);
    expect(entryQty).toBe(1);
  });

  test('exportar e importar el backup restaura las tres entidades de almacenes', async ({
    signedInPage,
  }, testInfo) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    // Estado: 1 almacén con stock + 1 movimiento purchase_in.
    await createWarehouse(page, 'Backup');
    const product = await firstProductName(page, selectedStoreId);
    await purchaseIn(page, 'Backup', product, '24', '660');
    expect(await onHandCell(page, 'Backup')).toBe('24');

    // Exportar ZIP real desde /sync/export.
    const zip = await exportBackupZip(page, testInfo.outputPath('warehouses-backup.zip'));

    // Borrar las entidades en localStorage simula un dispositivo nuevo...
    await page.evaluate((sid) => {
      localStorage.removeItem(`lizoft.store-warehouses-${sid}`);
      localStorage.removeItem(`lizoft.store-warehouse-stock-levels-${sid}`);
      localStorage.removeItem(`lizoft.store-warehouse-stock-movements-${sid}`);
    }, selectedStoreId);

    // ...y reimportar el backup restaura todo en la UI de Almacenes.
    await importBackupZip(page, zip, 'warehouses-backup.zip');
    await openWarehouses(page);
    const card = warehouseCard(page, 'Backup');
    await expect(card).toBeVisible();
    expect(await onHandCell(page, 'Backup')).toBe('24');
    expect(await costCell(page, 'Backup')).toBe('$660');

    // Movimientos: el merge append-only restauró exactamente el exportado (sin duplicar).
    await openMovementsToday(page);
    await expect(page.locator('[data-testid^="mv-qty-"]')).toHaveCount(1);
  });

  test('el ítem de menú Almacenes se oculta sin el feature y aparece al habilitarlo', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;
    // Módulo 13 (Add-Warehouses-Module): toda tienda nueva nace con el feature
    // Warehouses (36) para OwnerAdmin. Para probar el gating, primero lo
    // QUITAMOS del AUTH_MODEL + currentUser en localStorage (seam inverso) y
    // recargamos.
    await disableWarehouseFeatures(page);

    // Sin el feature (36): el ítem no aparece.
    await page.goto('/inventory/available');
    await page.waitForLoadState('networkidle');
    await openSidebar(page);
    await expect(warehousesMenuLink(page)).toHaveCount(0);

    // Con el feature habilitado (seam localStorage + reload): aparece.
    await enableWarehouseFeatures(page);
    await page.goto('/inventory/available');
    await page.waitForLoadState('networkidle');
    await openSidebar(page);
    await expect(warehousesMenuLink(page)).toBeVisible();
    await warehousesMenuLink(page).click();
    await expect(page.getByTestId('warehouses-page-title')).toBeVisible();
  });

  test('venta tras salida a tienda descuenta FIFO con el costo del almacén', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    // Almacén con costo conocido: 24 × $660, sale_out de 12 → entrada 12 × 660.
    await createWarehouse(page, 'FIFO');
    const product = await firstProductName(page, selectedStoreId);
    await purchaseIn(page, 'FIFO', product, '24', '660');
    expect(await onHandCell(page, 'FIFO')).toBe('24');
    await saleOut(page, 'FIFO', '12');
    expect(await onHandCell(page, 'FIFO')).toBe('12');

    // Vender 1 unidad: la ganancia usa precio_venta − 660 (FIFO al costo del almacén).
    await createSaleOfFirstProduct(page);

    // today-sales-profit: margen total = 10 − 660 = −650 → "-$650".
    const profit = await readTotalProfit(page);
    expect(profit).toBe('-$650');
  });

  test('un usuario de tienda (StoreUser) no ve Almacenes y la ruta lo desloguea', async ({
    signedInPage,
    browser,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    // Crear un StoreUser real vía API (rol 3 = ERoles.StoreUser) desde la
    // sesión OwnerAdmin — mismo patrón que create-store-user.spec.ts test 3.
    const token = await readBearerToken(page);
    const identity = newTestIdentity();
    const storeUserEmail = `${identity.login}@e2e.test`;
    const response = await page.request.post(`${E2E_API_URL}/v1/storeusers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        storeId: selectedStoreId,
        fullName: identity.fullName,
        login: identity.login,
        password: identity.password,
        cellPhone: identity.cellPhone,
        email: storeUserEmail,
        roleIds: [3],
      },
    });
    expect(response.ok()).toBeTruthy();

    // Contexto fresco: login real como StoreUser (la app le asigna su home).
    const ctx = await browser.newContext();
    const storeUserPage = await ctx.newPage();
    const { LoginPage } = await import('./support/login-page');
    const loginPage = new LoginPage(storeUserPage);
    await loginPage.goto();
    await loginPage.fill(identity);
    await loginPage.submit();
    await expect(storeUserPage.getByRole('link', { name: 'Catálogo Productos' })).toBeVisible({
      timeout: 15_000,
    });

    // El ítem de menú 🏬 Almacenes NO aparece para el StoreUser (Warehouses es
    // OwnerAdmin-only; isUserAuthorized no tiene bypass y su rol no incluye 36).
    await openSidebar(storeUserPage);
    await expect(warehousesMenuLink(storeUserPage)).toHaveCount(0);

    // Acceso directo a la ruta → featureLoader (sin bypass) desloguea y
    // redirige a /login (denyAccess, loaders.ts:16-19).
    await storeUserPage.goto('http://localhost:3333/inventory/warehouses');
    await storeUserPage.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(storeUserPage.locator('#login')).toBeVisible();

    await ctx.close();
  });
});
