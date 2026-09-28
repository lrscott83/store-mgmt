using System;
using System.Collections.Generic;

namespace Application.Dtos.StoreManagement
{
    /// <summary>
    /// Saved state of ONE row of the store-module pricing save
    /// (PUT /v1/stores/{storeId}/module-pricing). Echoes the three editable price
    /// fields exactly as they were persisted, plus the resulting active flag.
    /// </summary>
    public sealed class StoreModulePricingDto
    {
        public int ModuleId { get; set; }

        /// <summary>
        /// Resulting <c>StoreModule.IsActive</c>: true when the operator ticked the row,
        /// false when they unticked it. A row absent from the request is NOT echoed —
        /// absent means "not shown to the operator", never "deactivated" (see the
        /// handler's payload-universe rule).
        /// </summary>
        public bool IsActive { get; set; }

        public float Price { get; set; }

        public float DiscountPrice { get; set; }

        public float PercentDiscountPrice { get; set; }

        /// <summary>
        /// <c>CurrentPriceServiceUtils.GetCurrentPrice(price, percentDiscountPrice,
        /// discountPrice)</c> over the three fields above — the same value the rest of the
        /// system reports as a module's current price.
        /// </summary>
        public float CurrentPrice { get; set; }
    }

    /// <summary>
    /// Result of the store-module pricing save: the echoed state of every row the
    /// operator was shown, plus the total of the TICKED rows.
    /// </summary>
    public sealed class StoreModulePricingResultDto
    {
        public Guid StoreId { get; set; }

        public List<StoreModulePricingDto> Modules { get; set; }

        /// <summary>
        /// Σ <see cref="StoreModulePricingDto.CurrentPrice"/> over the TICKED rows only.
        /// <para>
        /// This is the modal's total — the number the browser recomputes live from the
        /// same three fields — and is deliberately NOT the billable amount.
        /// <c>BillingService</c> excludes <c>ModulePriceIncluded</c> modules from what it
        /// bills (<c>BillingService.cs:81</c>), so for a store holding included (gratis)
        /// modules the two numbers legitimately differ. Keeping the server total as the
        /// plain ticked-row sum is what pins the client formula to the server formula.
        /// </para>
        /// <para>
        /// Accumulated in <see cref="double"/> from the <see cref="float"/> row values so
        /// the running sum does not inherit float32 rounding as it grows.
        /// </para>
        /// </summary>
        public double TotalCurrentPrice { get; set; }
    }
}
