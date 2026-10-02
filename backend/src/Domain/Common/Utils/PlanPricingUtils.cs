using System;
using System.Collections.Generic;
using System.Linq;
using Domain.Entities.Modules;
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
        /// <para>
        /// Both columns count EXACTLY the same rows: the billable ones, i.e. those satisfying
        /// <see cref="ModulePriceCalculator.IsBillable"/> (active and not price-included). The
        /// effective column is not re-derived here — it comes from
        /// <see cref="ModulePriceCalculator.CalculateTotal(IEnumerable{Module})"/>, the single
        /// rule — while the base-price column reuses the same predicate so the two can never
        /// disagree about which modules are included.
        /// </para>
        /// </summary>
        public static (float Price, float CurrentPrice) Sum(StorePlan? plan)
        {
            if (plan is null) return (0f, 0f);

            List<Module> billableModules = plan.StorePlanModules
                .Select(spm => spm.Module)
                .Where(module => module is not null
                    && ModulePriceCalculator.IsBillable(module.IsActive, module.PriceIncluded))
                .ToList();

            float price = billableModules.Sum(m => m.Price);
            float currentPrice = ModulePriceCalculator.CalculateTotal(billableModules);
            return (price, currentPrice);
        }
    }
}
