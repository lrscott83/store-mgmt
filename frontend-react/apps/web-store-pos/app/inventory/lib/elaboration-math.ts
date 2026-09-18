import type { Recipe, WarehouseStockLevel } from '@store-mgmt/domain';
import { round2 } from '~/shared/lib/money';

/**
 * Elaboración — pure planning helpers (no I/O, no state), the `wholesale.ts`
 * pattern. `planElaboration` turns a recipe + a batch count + the holding
 * warehouse's stock levels into the estimate the confirm screen shows: the
 * scrap-inflated theoretical consumption of every ingredient, the
 * weighted-average cost the warehouse holds, and the estimated total/unit cost.
 *
 * Pinned costing rules (plan 2026-09-04-elaboration-module.md, §"Costing rules"):
 * - theoreticalQty = qty × batches × (1 + scrapPct/100), round2.
 * - costPrice = the matching stock level's weighted-average `costPrice`
 *   (NOT `productCosts`, NOT the last entry); `available` = its `onHand`.
 *   A component with no matching level has costPrice 0, available 0 and is
 *   never sufficient.
 * - ingredientsCost = Σ(theoreticalQty × costPrice).
 * - overheadCost = ingredientsCost × overheadPct/100.
 * - laborCostTotal = recipe.laborCost × batches.
 * - estimatedTotal = ingredientsCost + overheadCost + laborCostTotal.
 * - producedQty = recipe.outputQty × batches.
 * - estimatedUnit = estimatedTotal / producedQty.
 *
 * ROUNDING NOTE (recorded deliberately): the plan's pinned acceptance math
 * (recipe outputQty 20, harina 3@2% + levadura 0.05 + sal 0.04 + agua 2@5%,
 * labor 50, overhead 10%; warehouse costs 20/80/15/0.5) must yield
 * `estimatedTotal === 123.535` and `estimatedUnit === 6.18`. Rounding the
 * overhead (6.685) and/or the total to 2 decimals does NOT produce 123.535
 * (`round2(6.685) = 6.69` → total 123.54; `round2(123.535) = 123.54`), so the
 * overhead and the total are kept as the raw arithmetic result, exactly as the
 * plan's example does (66.85 + 6.685 + 50 = 123.535). `estimatedUnit` IS
 * round2 (123.535/20 = 6.17675 → 6.18). All the other money/quantity values
 * (theoreticalQty, costPrice, available, ingredientsCost, laborCostTotal,
 * producedQty, estimatedUnit) are round2.
 */

/** One ingredient's share of the elaboration estimate. */
export interface ElaborationPlanComponent {
  /** Ingredient product id. */
  productId: string;
  /** Scrap-inflated theoretical consumption: `qty × batches × (1 + scrapPct/100)`, round2. */
  theoreticalQty: number;
  /** Weighted-average unit cost held by the warehouse (0 when there is no level). */
  costPrice: number;
  /** Available quantity in the warehouse (0 when there is no level). */
  available: number;
  /** `available >= theoreticalQty`. */
  sufficient: boolean;
}

/** The full estimate for one elaboration run. */
export interface ElaborationPlan {
  components: ElaborationPlanComponent[];
  /** Units of finished product = `recipe.outputQty × batches`, round2. */
  producedQty: number;
  /** `recipe.laborCost × batches`, round2. */
  laborCostTotal: number;
  /** `ingredientsCost × overheadPct/100` (raw, see rounding note). */
  overheadCost: number;
  /** Σ(theoreticalQty × costPrice), round2. */
  ingredientsCost: number;
  /** `ingredientsCost + overheadCost + laborCostTotal` (raw, see rounding note). */
  estimatedTotal: number;
  /** `estimatedTotal / producedQty`, round2 (0 when producedQty is 0). */
  estimatedUnit: number;
  /** True when every ingredient has enough stock available. */
  sufficient: boolean;
}

/**
 * Plans an elaboration. `stockLevels` is expected to be the levels of the ONE
 * holding warehouse (the caller filters with
 * `WarehouseOfflineService.getStockLevels(warehouseId)`); a component is
 * matched to its level by `productId`.
 */
export function planElaboration(
  recipe: Recipe,
  batches: number,
  stockLevels: WarehouseStockLevel[],
): ElaborationPlan {
  const components: ElaborationPlanComponent[] = recipe.components.map((component) => {
    const theoreticalQty = round2(component.qty * batches * (1 + component.scrapPct / 100));
    const level = stockLevels.find((stock) => stock.productId === component.productId);
    const costPrice = level ? round2(level.costPrice) : 0;
    const available = level ? round2(level.onHand) : 0;
    return {
      productId: component.productId,
      theoreticalQty,
      costPrice,
      available,
      sufficient: level !== undefined && available >= theoreticalQty,
    };
  });

  let ingredientsCost = 0;
  for (const component of components) {
    ingredientsCost = round2(ingredientsCost + component.theoreticalQty * component.costPrice);
  }

  const laborCostTotal = round2(recipe.laborCost * batches);
  const overheadCost = (ingredientsCost * recipe.overheadPct) / 100;
  const estimatedTotal = ingredientsCost + overheadCost + laborCostTotal;
  const producedQty = round2(recipe.outputQty * batches);

  return {
    components,
    producedQty,
    laborCostTotal,
    overheadCost,
    ingredientsCost,
    estimatedTotal,
    estimatedUnit: producedQty > 0 ? round2(estimatedTotal / producedQty) : 0,
    sufficient: components.every((component) => component.sufficient),
  };
}
