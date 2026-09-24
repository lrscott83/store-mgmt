import { test, expect } from './support/test';
import {
  createRecipe,
  createSellableProduct,
  createWarehouse,
  elaborationHistoryRow,
  expandTodayElaborationHistory,
  openProfitForProduct,
  purchaseIntoWarehouse,
  runElaboration,
  sellOneUnit,
} from './support/elaboration-flow';

/**
 * Elaboración — costo real (plan 2026-09-04-elaboration-module.md §Task 7).
 *
 * Persona `owner-admin-with-products` (reused, no new fixture). The whole
 * point of the module: the FIRST sale of an elaborated unit discounts the
 * REAL recorded unit cost, not zero and not an estimate. One deterministic
 * scenario, no dependency on another spec:
 *
 *   1. Persona: 1 category + 1 sellable product already seeded (fixture).
 *   2. Three NEW products + a warehouse with stock for TWO ingredients
 *      (seeded through the real warehouses UI: gear → Entrada).
 *   3. A recipe for a NEW finished product (Real `/inventory/recipes` UI):
 *      output 10/batch, one unit of each ingredient per output, no labor /
 *      overhead.
 *   4. Elaborate 2 BATCHES (Real `/inventory/elaborations` UI) → produced 20.
 *   5. Assert the plan preview AND the history show the real cost:
 *      total $100, unit $5 (2 ingredients × real warehouse cost ÷ 20 units).
 *   6. Sell ONE unit of the finished product at $25.
 *   7. Assert today's profit view for that product shows
 *      salePrice − recorded unitCost = $25 − $5 = $20 (unit cost cell $5).
 *
 * Math: purchase 10 × $20 + 10 × $30 → recipe consumes 1 + 1 per output ×
 * 2 batches = 2 × $20 + 2 × $30 = $100 total → $5/unit over 20 produced.
 *
 * All seed state is created inside this test, with a per-run unique suffix, so
 * a retry or a sibling spec sharing the worker cannot collide with it.
 */
test.describe.serial('Elaboración — costo real descontado en la primera venta', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('receta → 2 lotes → costo real → venta de 1 unidad → ganancia', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    // Per-run unique names: the reconciliation never depends on another test's
    // leftovers and a retry re-seeds cleanly.
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const ingredientA = `Insumo A ${suffix}`;
    const ingredientB = `Insumo B ${suffix}`;
    const finishedProduct = `Terminado ${suffix}`;
    const warehouseName = `Central ${suffix}`;

    const FINISHED_PRICE = 25;
    const PAYMENT = '25';
    const EXPECTED_TOTAL_COST = '100 CUP';
    const EXPECTED_UNIT_COST = '5 CUP';
    const EXPECTED_PROFIT = '20 CUP';

    // ── Step 2 (part 1): the three products the recipe needs. ──────────────
    // Ingredients (any price) + the new finished product at $25.
    await createSellableProduct(page, ingredientA, '10');
    await createSellableProduct(page, ingredientB, '10');
    await createSellableProduct(page, finishedProduct, String(FINISHED_PRICE));

    // ── Step 2 (part 2): warehouse + real stock for the two ingredients. ───
    await createWarehouse(page, warehouseName);
    await purchaseIntoWarehouse(page, warehouseName, ingredientA, '10', '20');
    await purchaseIntoWarehouse(page, warehouseName, ingredientB, '10', '30');

    // ── Step 3: recipe for the new finished product. ───────────────────────
    await createRecipe(page, {
      finishedProduct,
      outputQty: 10,
      components: [
        { productName: ingredientA, qty: 1 },
        { productName: ingredientB, qty: 1 },
      ],
      laborCost: 0,
      overheadPct: 0,
    });

    // ── Step 4/5: elaborate 2 batches; the preview carries the real cost. ──
    const preview = await runElaboration(page, {
      recipeLabel: finishedProduct,
      batches: 2,
      warehouseName,
    });
    expect(preview.producedQty).toBe('20');
    expect(preview.totalCost).toBe(EXPECTED_TOTAL_COST);
    expect(preview.unitCost).toBe(EXPECTED_UNIT_COST);

    // The history is the audit trail: it must show the SAME real cost.
    await expandTodayElaborationHistory(page);
    const historyRow = elaborationHistoryRow(page, finishedProduct);
    await expect(historyRow).toBeVisible();
    await expect(historyRow.locator('span.text-primary')).toHaveText(EXPECTED_TOTAL_COST);
    await expect(historyRow.locator('span.text-success')).toHaveText(EXPECTED_UNIT_COST);

    // ── Step 6: sell ONE unit of the finished product. ─────────────────────
    await sellOneUnit(page, finishedProduct, PAYMENT);

    // ── Step 7: the profit view discounts the REAL recorded unit cost. ─────
    const profitRow = await openProfitForProduct(page, finishedProduct);
    // Cost cell (unit cost over total cost) and profit cell.
    await expect(profitRow.locator('td').nth(3)).toContainText(EXPECTED_UNIT_COST);
    await expect(profitRow.locator('td').nth(4)).toHaveText(EXPECTED_PROFIT);
  });
});
