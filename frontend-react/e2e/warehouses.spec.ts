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
 *   9. Ítem de menú Almacenes: presente para toda tienda OwnerAdmin nueva
 *       (el módulo 13 del catálogo asigna el feature 36 en runtime); el gate
 *       por rol lo cubre el test 11.
 *   10. Regresión venta: FIFO con el costo del almacén en today-sales-profit.
 *   11. Acceso por rol: un StoreUser (empleado, rol 3) no ve el ítem de menú y
 *      la ruta /inventory/warehouses lo desloguea (Warehouses es OwnerAdmin-only
 *      en StoreRoleFeatures.cs:86-89; featureLoader sin bypass para StoreUser).
 *
 * El módulo 13 (Add-Warehouses-Module, 2026-09-06) asigna Warehouses (36) a
 * toda tienda nueva en runtime, así que la persona OwnerAdmin ya lo trae. El
 * seam enableWarehouseFeatures sigue en uso para recargas defensivas tras
 * manipular localStorage, pero la presencia del ítem ya no depende de él.
 */

const NEW_WAREHOUSE = 'Nuevo almacén'; // WAREHOUSES.NEW_WAREHOUSE
const SAVE = 'Guardar'; // WAREHOUSES.SAVE
const PURCHASE_IN = 'Entrada (compra)'; // WAREHOUSES.PURCHASE_IN
const SALE_OUT = 'Salida a tienda'; // WAREHOUSES.SALE_OUT
const TRANSFER = 'Transferir'; // WAREHOUSES.TRANSFER
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

/** Sale out: opens the movement form on the first stocked row and saves. */
async function saleOut(page: Page, warehouseName: string, quantity: string): Promise<void> {
  await page.getByText(SALE_OUT, { exact: true }).first().click();
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
  return (
    await page
      .locator('span.text-lg.font-bold.text-success')
      .first()
      .innerText()
  ).trim();
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

  test('desactivar almacén con stock se bloquea y almacén vacío sí se desactiva', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;
    await enableWarehouseFeatures(page);
    await openWarehouses(page);

    // Almacén CON stock: crear + comprar 24.
    await createWarehouse(page, 'Con Stock');
    const product = await firstProductName(page, selectedStoreId);
    await page.getByTestId('warehouse-toggle-Con Stock').click();
    await purchaseIn(page, 'Con Stock', product, '24', '660');
    await expect(onHandCell(page, 'Con Stock')).toHaveText('24');

    // Intentar desactivar → Swal con CannotDeactivate, el almacén sigue activo.
    // (2026-09-06 UI redesign: "Desactivar" lives in the per-warehouse gear menu
    //  now — open it first, then click the menuitem. Authorized adaptation.)
    await page.getByRole('button', { name: 'Acciones de Con Stock' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await expect(page.getByText(CANNOT_DEACTIVATE)).toBeVisible();
    await dismissSwal(page);
    await expect(page.getByTestId('warehouse-card-Con Stock')).toBeVisible();
    await expect(page.getByTestId('warehouse-card-Con Stock').getByText(INACTIVE_TAG)).toHaveCount(0);

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
    await page.getByTestId('warehouse-toggle-Decimal').click();

    // purchase_in de 10.555 → onHand 10.56 (round2).
    await purchaseIn(page, 'Decimal', product, '10.555', '100');
    await expect(onHandCell(page, 'Decimal')).toHaveText('10.56');

    // El movimiento registra la cantidad redondeada (10.56).
    await expect(page.locator('[data-testid^="mv-qty-"]').first()).toHaveText('10.56');

    // sale_out de 2.5 → almacén queda en 8.06 y la entrada de la tienda se crea.
    await saleOut(page, 'Decimal', '2.5');
    await expect(onHandCell(page, 'Decimal')).toHaveText('8.06');

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
    await page.getByTestId('warehouse-toggle-Backup').click();
    await purchaseIn(page, 'Backup', product, '24', '660');
    await expect(onHandCell(page, 'Backup')).toHaveText('24');

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
    await page.getByTestId('warehouse-toggle-Backup').click();
    await expect(onHandCell(page, 'Backup')).toHaveText('24');
    await expect(costCell(page, 'Backup')).toHaveText('$660');

    // Movimientos: el merge append-only restauró exactamente el exportado (sin duplicar).
    await expect(page.locator('[data-testid^="mv-qty-"]')).toHaveCount(1);
  });

  test('el ítem de menú Almacenes aparece para toda tienda OwnerAdmin nueva y navega', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;
    // Módulo 13 (Add-Warehouses-Module): toda tienda nueva nace con el feature
    // Warehouses (36) para OwnerAdmin → el ítem aparece sin seam manual. El
    // gate por rol (StoreUser no lo ve ni accede) lo cubre el test 11.
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
    await page.getByTestId('warehouse-toggle-FIFO').click();
    await purchaseIn(page, 'FIFO', product, '24', '660');
    await expect(onHandCell(page, 'FIFO')).toHaveText('24');
    await saleOut(page, 'FIFO', '12');
    await expect(onHandCell(page, 'FIFO')).toHaveText('12');

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