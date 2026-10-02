/**
 * Module-price arithmetic — the ONE client mirror of the backend's price rule:
 *
 *   1. `ModulePriceCalculator.IsBillable` (ModulePriceCalculator.cs:65)
 *        = isActive && !priceIncluded
 *   2. `CurrentPriceServiceUtils.GetCurrentPrice` (CurrentPriceServiceUtils.cs:11-17)
 *        float currentPrice = price - price * percentDiscountPrice / 100 - discountPrice;
 *        if (currentPrice < 0) currentPrice = 0;
 *
 * Percent first, then the flat discount, no rounding anywhere, clamped at zero. Only
 * billable rows contribute; {@link totalModulePricing} is the ONE place that decides which
 * rows those are, so no caller re-implements the filter.
 *
 * It lives here in @store-mgmt/domain rather than in an app because it is business logic
 * every consumer that prices a module needs, and a second copy inside an app would drift
 * from the server without failing any build.
 *
 * Drift risk: C# evaluates the expression in `float` (float32) and widens the result,
 * while JavaScript evaluates it in `number` (float64). The two agree to roughly seven
 * significant digits, so a strict `===` against a server-computed total can fail in the
 * last bits. Compare totals with an epsilon, or prefer the server's own
 * `totalCurrentPrice` after a save (see `StoreModulePricingResult`).
 */

/**
 * The two flags THE price rule reads. Kept as a standalone shape so the rule can be
 * expressed over any row that carries them (a catalog `Module`, a `PlanModule`, a
 * `StoreModule` snapshot or an editor draft) without each caller restating the pair.
 */
export interface ModulePriceFlags {
  isActive: boolean;
  priceIncluded: boolean;
}

/** One priced row: the two rule flags plus the three editable price fields. */
export interface ModulePricingRow extends ModulePriceFlags {
  moduleId: number;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
}

/**
 * The single-module rule, the mirror of `ModulePriceCalculator.IsBillable`:
 * a module contributes to a total only when it is active AND its price is not
 * already included in what the store pays.
 */
export function isBillableModule(module: ModulePriceFlags): boolean {
  return module.isActive && !module.priceIncluded;
}

/**
 * Current price of a single module. The parameter order is deliberately IDENTICAL to
 * `CurrentPriceServiceUtils.GetCurrentPrice(price, percentDiscountPrice, discountPrice)`
 * so the two implementations can be compared line for line — do not reorder them.
 */
export function currentModulePrice(
  price: number,
  percentDiscountPrice: number,
  discountPrice: number,
): number {
  const currentPrice = price - (price * percentDiscountPrice) / 100 - discountPrice;
  return currentPrice < 0 ? 0 : currentPrice;
}

/**
 * The two columns a plan (or any module collection) is displayed with: the BASE sum and the
 * EFFECTIVE sum. The shape mirrors the backend's `PlanPricingUtils.Sum` tuple
 * (`(float Price, float CurrentPrice)`), named here because JavaScript has no tuples.
 */
export interface ModulePricingTotals {
  /** Σ base `price` over the billable rows. */
  price: number;
  /** Σ effective (`currentModulePrice`) over the billable rows. */
  currentPrice: number;
}

/**
 * Total of a module collection — the ONE client mirror of
 * `ModulePriceCalculator.CalculateTotal`, returning BOTH columns the way
 * `PlanPricingUtils.Sum` does.
 *
 * Rule: an inactive module contributes 0, a price-included (gratis) module contributes 0,
 * and every other row contributes its effective price (`currentModulePrice`). The CALLER
 * picks the collection (a plan's cumulative members, a store's ticked rows, a group of the
 * catalog table); this method only applies the conditions. An empty collection is 0/0.
 *
 * Both columns count EXACTLY the same rows — the billable ones — so the base can never
 * strike through a number built from a different set than the effective price beside it.
 *
 * No rounding: plain accumulation, matching LINQ `Sum` semantics.
 */
export function totalModulePricing(
  modules: readonly ModulePricingRow[],
): ModulePricingTotals {
  let price = 0;
  let currentPrice = 0;
  for (const module of modules) {
    if (!isBillableModule(module)) continue;
    price += module.price;
    currentPrice += currentModulePrice(
      module.price,
      module.percentDiscountPrice,
      module.discountPrice,
    );
  }
  return { price, currentPrice };
}
