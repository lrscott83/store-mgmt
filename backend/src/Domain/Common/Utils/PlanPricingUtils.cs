using System;
using Domain.Entities.Plans;

namespace Domain.Common.Utils
{
    /// <summary>
    /// Single source of truth for a plan's displayed price: Σ GetCurrentPrice over the
    /// plan's member modules — the exact formula PlanProfile applies for GET /v1/plans.
    /// Store cards consume this instead of the per-store StoreModule snapshot
    /// (docs/plans/2026-09-15-store-plan-canonical-price-plan.md), so every view over the
    /// same database shows the same numbers by construction: price = f(StorePlanId, catalog).
    /// </summary>
    public static class PlanPricingUtils
    {
        /// <summary>
        /// Sums the plan's member modules (original price and discounted current price).
        /// A null plan (no catalog plan for the store) sums to zero — callers gate on it.
        /// </summary>
        public static (float Price, float CurrentPrice) Sum(StorePlan? plan)
        {
            if (plan is null) return (0f, 0f);

            float price = 0f, currentPrice = 0f;
            foreach (var storePlanModule in plan.StorePlanModules)
            {
                var module = storePlanModule.Module;
                if (module is null) continue;
                price += module.Price;
                currentPrice += CurrentPriceServiceUtils.GetCurrentPrice(
                    module.Price, module.PercentDiscountPrice, module.DiscountPrice);
            }
            return (price, currentPrice);
        }
    }
}
