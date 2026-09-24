import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Elaboración — flow helpers for `elaboration.spec.ts` (NEW file, plan
 * 2026-09-04-elaboration-module.md §Task 7). Every selector below already
 * exists in production code:
 *
 * - Products: `/sales/products` create modal (`create-product-modal.tsx`)
 *   reached from the category gear (`category-actions-menu.tsx`).
 * - Warehouse stock: `/inventory/warehouses` create modal
 *   (`warehouse-form-modal.tsx`) + the per-warehouse gear `Entrada`
 *   (`warehouse-movement-modal.tsx`, mode `purchase_in`).
 * - Recipe: `/inventory/recipes` (`recipes.tsx` + `recipe-form-modal.tsx`).
 * - Elaboration: `/inventory/elaborations` (`elaborations.tsx`).
 * - Sale: `/sales/new` (`sale.tsx` + `sale-product-row.tsx`).
 * - Profit: `/inventory/today-sales-profit` (`today-sales-profit.tsx`).
 *
 * Nothing here mutates `localStorage` directly for business data: all seeds
 * go through the real UI (offline services), mirroring `store-seed.ts` and
 * `warehouses.spec.ts`. No feature seam is needed on the new routes:
 * `featureLoader` bypasses the feature check for an OwnerAdmin
 * (`loaders.ts`), and the `owner-admin-with-products` persona is one.
 */

export interface ElaborationRecipeComponent {
  /** Ingredient product name (must exist as an active product). */
  productName: string;
  /** Quantity per ONE output unit of the finished product. */
  qty: number;
}

export interface CreateRecipeOptions {
  /** Finished product name (must exist as an active product). */
  finishedProduct: string;
  /** Units ONE batch produces. */
  outputQty: number;
  components: ElaborationRecipeComponent[];
  laborCost?: number;
  overheadPct?: number;
}

export interface RunElaborationOptions {
  /** Option label of the recipe — the finished product's name (`elaborations.tsx`). */
  recipeLabel: string;
  batches: number;
  warehouseName: string;
}

/** Snapshot of the plan preview shown before confirming. */
export interface ElaborationPreview {
  totalCost: string;
  unitCost: string;
  producedQty: string;
}

/** Local calendar day key of "now" INSIDE the page (never `toISOString` — UTC day). */
export async function localTodayKey(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });
}

async function expandFirstProductCategory(page: Page): Promise<void> {
  const categoryToggle = page.locator('[data-testid^="category-panel-toggle-"]').first();
  await expect(categoryToggle).toBeVisible();
  if ((await categoryToggle.getAttribute('aria-expanded')) !== 'true') {
    await categoryToggle.click();
  }
}

/**
 * Creates an active / available-to-sale product through the real products UI.
 * `create-product-modal.tsx` defaults `isActive`, `availableToSale` and
 * `discountFromInvantory` to true — so a created product is immediately
 * sellable and its inventory is consumed by a sale.
 */
export async function createSellableProduct(
  page: Page,
  name: string,
  price: string,
): Promise<void> {
  await page.goto('/sales/products');
  await page.waitForLoadState('networkidle');
  await expandFirstProductCategory(page);

  const gear = page.locator('[data-testid^="category-actions-toggle-"]').first();
  await gear.click();
  await page.getByTestId('add-product-button').click();
  await expect(page.getByTestId('product-name-input')).toBeVisible();
  await page.getByTestId('product-name-input').fill(name);
  await page.getByTestId('product-price-input').fill(price);
  await page.getByTestId('create-product-submit').click();
  await expect(page.getByTestId('product-name-input')).toHaveCount(0);
}

/** Creates a warehouse via the real `/inventory/warehouses` UI. */
export async function createWarehouse(page: Page, name: string): Promise<void> {
  await page.goto('/inventory/warehouses');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('warehouses-page-title')).toBeVisible();

  await page.getByText('Nuevo almacén').click();
  await page.getByTestId('warehouse-name-input').fill(name);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId(`warehouse-card-${name}`)).toBeVisible();
}

/**
 * Registers a `purchase_in` (gear → Entrada) for a product: product combobox,
 * quantity and unit cost, then save. Leaves the warehouse holding the stock.
 */
export async function purchaseIntoWarehouse(
  page: Page,
  warehouseName: string,
  productName: string,
  quantity: string,
  cost: string,
): Promise<void> {
  await page.getByRole('button', { name: `Acciones de ${warehouseName}` }).click();
  await page.getByRole('menuitem', { name: 'Entrada', exact: true }).click();

  const productInput = page.getByTestId('movement-product');
  await expect(productInput).toBeVisible();
  await productInput.click();
  await productInput.fill(productName);
  const option = page.getByTestId('movement-product-listbox').locator('[role="option"]').first();
  await expect(option).toBeVisible();
  await option.click();

  await page.getByTestId('movement-quantity').fill(quantity);
  await page.getByTestId('movement-cost').fill(cost);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('movement-form-purchase_in')).toHaveCount(0);
}

/** Creates a recipe (BoM) through the real `/inventory/recipes` UI. */
export async function createRecipe(page: Page, options: CreateRecipeOptions): Promise<void> {
  await page.goto('/inventory/recipes');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('recipe-new').click();
  await expect(page.getByTestId('recipe-modal')).toBeVisible();

  await page.getByTestId('recipe-product').selectOption({ label: options.finishedProduct });
  await page.getByTestId('recipe-output-qty').fill(String(options.outputQty));

  for (const [index, component] of options.components.entries()) {
    if (index > 0) {
      await page.getByTestId('recipe-add-component').click();
    }
    await page
      .getByTestId(`recipe-component-product-${index}`)
      .selectOption({ label: component.productName });
    await page.getByTestId(`recipe-component-qty-${index}`).fill(String(component.qty));
    await page.getByTestId(`recipe-component-scrap-${index}`).fill('0');
  }

  if (options.laborCost !== undefined) {
    await page.getByTestId('recipe-labor-cost').fill(String(options.laborCost));
  }
  if (options.overheadPct !== undefined) {
    await page.getByTestId('recipe-overhead-pct').fill(String(options.overheadPct));
  }

  const save = page.getByTestId('recipe-save');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByTestId('recipe-modal')).toHaveCount(0);
}

/**
 * Runs an elaboration of `batches` and confirms it, returning the plan
 * preview's real-cost strings (captured BEFORE confirming). The service is the
 * source of truth: a stock shortfall fails inline with the named message and
 * writes nothing, so the spec can rely on the preview matching the record.
 */
export async function runElaboration(
  page: Page,
  options: RunElaborationOptions,
): Promise<ElaborationPreview> {
  await page.goto('/inventory/elaborations');
  await page.waitForLoadState('networkidle');

  await page.getByTestId('elaboration-recipe').selectOption({ label: options.recipeLabel });
  await page.getByTestId('elaboration-batches').fill(String(options.batches));
  await page.getByTestId('elaboration-warehouse').selectOption({ label: options.warehouseName });

  await expect(page.getByTestId('elaboration-plan')).toBeVisible();
  const preview: ElaborationPreview = {
    totalCost: (await page.getByTestId('elaboration-total-cost').innerText()).trim(),
    unitCost: (await page.getByTestId('elaboration-unit-cost').innerText()).trim(),
    producedQty: (await page.getByTestId('elaboration-produced-qty').innerText()).trim(),
  };

  await page.getByTestId('elaboration-confirm').click();
  // Confirm resets the form (and with it the plan panel).
  await expect(page.getByTestId('elaboration-plan')).toHaveCount(0);
  return preview;
}

/** Expands today's day panel in the elaboration history (collapsed by default). */
export async function expandTodayElaborationHistory(page: Page): Promise<void> {
  const todayKey = await localTodayKey(page);
  const toggle = page.getByTestId(`elaboration-day-toggle-${todayKey}`);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}

/** The history row of one finished product (rows are identified by product name). */
export function elaborationHistoryRow(page: Page, productName: string): Locator {
  return page
    .locator('[data-testid^="elaboration-history-row-"]')
    .filter({ hasText: productName })
    .first();
}

/** Sells ONE unit of `productName` through the real `/sales/new` UI. */
export async function sellOneUnit(
  page: Page,
  productName: string,
  paymentAmount: string,
): Promise<void> {
  await page.goto('/sales/new');
  await page.waitForLoadState('networkidle');

  await page.getByRole('searchbox').fill(productName);
  const addButton = page.getByRole('button', { name: 'Adicionar' }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(page.getByTestId('cart-badge')).toHaveText('1');

  await page.getByTestId('cart-badge').locator('..').click();
  const paymentInput = page.getByRole('spinbutton', { name: 'Pago' });
  await paymentInput.fill(paymentAmount);
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('La venta fue creada satisfactoriamente.')).toBeVisible();
}

/**
 * Opens today's profit view and returns the desktop table row of one product
 * (`today-sales-profit.tsx` renders `{categoryName} - {productName}` in the
 * first cell). Rows: 0 product, 1 sold, 2 price/amount, 3 cost (unit/total),
 * 4 profit.
 */
export async function openProfitForProduct(page: Page, productName: string): Promise<Locator> {
  await page.goto('/inventory/today-sales-profit');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Ganancias del Día')).toBeVisible();

  const row = page.locator('tbody tr').filter({ hasText: productName }).first();
  await expect(row).toBeVisible();
  return row;
}
