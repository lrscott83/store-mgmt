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

    /// <summary>
    /// ONE row of the store-module pricing READ (GET /v1/stores/{storeId}/module-pricing):
    /// what the store currently holds for a module the operator is allowed to price.
    /// <para>
    /// Deliberately a separate shape from the write echo (<see cref="StoreModulePricingDto"/>)
    /// rather than a widened copy of it. The read has to stand on its own — it carries the
    /// module <see cref="Name"/> because it is what seeds the editor — while the write echo is
    /// keyed purely by ModuleId because the client already holds the names. Two types means
    /// adding a seed-only field can never change the save's response contract.
    /// </para>
    /// </summary>
    public sealed class StoreModulePricingReadDto
    {
        public int ModuleId { get; set; }

        /// <summary>Catalog module name, copied verbatim.</summary>
        public string Name { get; set; }

        /// <summary>
        /// The store's <c>StoreModule.IsActive</c> when a row exists, false when it does not.
        /// This is the tick's initial state in the editor.
        /// </summary>
        public bool IsActive { get; set; }

        /// <summary>
        /// The store's own stored <c>Price</c> when a row exists — even when that row is
        /// inactive. With no row, the live catalog price is returned as the SEED, so an
        /// unticked row already shows what ticking it would cost instead of a column of zeros.
        /// </summary>
        public float Price { get; set; }

        /// <summary>The store's own <c>ModuleDiscountPrice</c>, else the catalog's.</summary>
        public float DiscountPrice { get; set; }

        /// <summary>The store's own <c>ModulePercentDiscountPrice</c>, else the catalog's.</summary>
        public float PercentDiscountPrice { get; set; }

        /// <summary>
        /// <c>CurrentPriceServiceUtils.GetCurrentPrice</c> over the three values above, for
        /// EVERY row — an unticked row reports what it WOULD cost. Only active rows are
        /// summed into <see cref="StoreModulePricingReadResultDto.TotalCurrentPrice"/>.
        /// </summary>
        public float CurrentPrice { get; set; }
    }

    /// <summary>
    /// The store-module pricing read: one row per module that is active and available to
    /// stores, plus the total over the ACTIVE ones.
    /// </summary>
    public sealed class StoreModulePricingReadResultDto
    {
        public Guid StoreId { get; set; }

        /// <summary>
        /// The COMPLETE universe the operator is shown, in catalog order. It is also the exact
        /// payload the save expects — a module absent from it is left untouched by design.
        /// </summary>
        public List<StoreModulePricingReadDto> Modules { get; set; }

        /// <summary>
        /// Σ <see cref="StoreModulePricingReadDto.CurrentPrice"/> over the rows whose
        /// <see cref="StoreModulePricingReadDto.IsActive"/> is true, in <see cref="double"/> so
        /// the running sum does not inherit float32 rounding. Same arithmetic the browser
        /// recomputes live, and — like the save's total — NOT the billable amount
        /// (<c>BillingService</c> excludes <c>ModulePriceIncluded</c> modules).
        /// </summary>
        public double TotalCurrentPrice { get; set; }
    }
}
