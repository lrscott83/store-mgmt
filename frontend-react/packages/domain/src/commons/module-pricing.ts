/**
 * Current-price arithmetic — the ONE client mirror of the backend's
 * `CurrentPriceServiceUtils.GetCurrentPrice`
 * (backend/src/Domain/Common/Utils/CurrentPriceServiceUtils.cs:11-17):
 *
 *   float currentPrice = price - price * percentDiscountPrice / 100 - discountPrice;
 *   if (currentPrice < 0) currentPrice = 0;
 *
 * Percent first, then the flat discount, no rounding anywhere, clamped at zero.
 * It lives here in @store-mgmt/domain rather than in an app because it is business
 * logic every consumer that prices a module needs, and a second copy inside the app
 * would drift from the server without failing any build.
 *
 * Drift risk: C# evaluates the expression in `float` (float32) and widens the result,
 * while JavaScript evaluates it in `number` (float64). The two agree to roughly seven
 * significant digits, so a strict `===` against a server-computed total can fail in the
 * last bits. Compare totals with an epsilon, or sum the server's own per-row
 * `currentPrice` values (see `StoreModulePricingResult`).
 */

/** One priced row: the three editable fields plus the tick. */
export interface ModulePricingRow {
  moduleId: number;
  isSelected: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
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
 * Total over the TICKED rows only — an unticked row contributes nothing, so the total
 * falls the moment a module is unticked.
 *
 * This is the modal's total, not the billable amount: the backend's BillingService
 * excludes `ModulePriceIncluded` (gratis) modules from what it bills
 * (BillingService.cs:81), so for a store holding included modules the two numbers
 * legitimately differ. The server returns the same ticked-row sum in
 * `StoreModulePricingResult.totalCurrentPrice`.
 */
export function totalCurrentModulePrice(modules: readonly ModulePricingRow[]): number {
  let total = 0;
  for (const module of modules) {
    if (module.isSelected) {
      total += currentModulePrice(module.price, module.percentDiscountPrice, module.discountPrice);
    }
  }
  return total;
}
