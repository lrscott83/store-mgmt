using System.Collections.Generic;
using System.Linq;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;

namespace Domain.Common.Utils
{
    /// <summary>
    /// The ONE rule that turns a collection of modules into a total price. Every price
    /// calculation in the codebase must route through here instead of re-writing the
    /// <c>IsActive &amp;&amp; !PriceIncluded -&gt; GetCurrentPrice</c> pipeline inline.
    ///
    /// Rule (fixed by the product owner):
    ///   <list type="bullet">
    ///     <item>An INACTIVE module contributes nothing.</item>
    ///     <item>An INCLUDED (already paid / bundled) module contributes nothing.</item>
    ///     <item>Everything else contributes its EFFECTIVE price, i.e. exactly
    ///     <see cref="CurrentPriceServiceUtils.GetCurrentPrice"/> — that formula is never
    ///     re-implemented here.</item>
    ///   </list>
    ///
    /// The CALLER picks the collection (a plan's modules, a store's own snapshot, the ticked
    /// rows in a grid); this class only applies the conditions. Two overloads exist because
    /// the two domain shapes name the same five values differently: catalog
    /// <see cref="Module"/> (<c>PriceIncluded</c> / <c>PercentDiscountPrice</c> /
    /// <c>DiscountPrice</c>) and the per-store snapshot
    /// <see cref="StoreModule"/> (<c>ModulePriceIncluded</c> /
    /// <c>ModulePercentDiscountPrice</c> / <c>ModuleDiscountPrice</c>).
    ///
    /// No rounding is applied anywhere: float32 arithmetic, same as the rest of the codebase.
    /// The summation is delegated to LINQ <c>Sum</c> (which accumulates in double and casts
    /// back to float) so the result is bit-identical to the hand-written
    /// <c>Where(...).Sum(...)</c> this replaces.
    /// </summary>
    public static class ModulePriceCalculator
    {
        /// <summary>Total of the billable catalog modules. Null or empty → 0.</summary>
        public static float CalculateTotal(IEnumerable<Module>? modules)
        {
            if (modules is null)
                return 0f;

            return modules
                .Where(static m => IsBillable(m.IsActive, m.PriceIncluded))
                .Sum(static m => CurrentPriceServiceUtils.GetCurrentPrice(
                    m.Price, m.PercentDiscountPrice, m.DiscountPrice));
        }

        /// <summary>Total of the billable store snapshot modules. Null or empty → 0.</summary>
        public static float CalculateTotal(IEnumerable<StoreModule>? storeModules)
        {
            if (storeModules is null)
                return 0f;

            return storeModules
                .Where(static sm => IsBillable(sm.IsActive, sm.ModulePriceIncluded))
                .Sum(static sm => CurrentPriceServiceUtils.GetCurrentPrice(
                    sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));
        }

        /// <summary>
        /// The single-module rule: a module is billable only when it is active and its price is
        /// NOT included in what the store already pays.
        /// </summary>
        public static bool IsBillable(bool isActive, bool priceIncluded) => isActive && !priceIncluded;

        /// <summary>
        /// Effective price of ONE module under the same rule: 0 when the module does not
        /// qualify, otherwise <see cref="CurrentPriceServiceUtils.GetCurrentPrice"/> clamped at 0.
        /// </summary>
        public static float GetEffectivePrice(
            bool isActive, bool priceIncluded, float price, float percentDiscountPrice, float discountPrice)
            => IsBillable(isActive, priceIncluded)
                ? CurrentPriceServiceUtils.GetCurrentPrice(price, percentDiscountPrice, discountPrice)
                : 0f;
    }
}