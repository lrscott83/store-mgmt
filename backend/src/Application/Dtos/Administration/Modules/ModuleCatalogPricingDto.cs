namespace Application.Dtos.Administration.Modules
{
    /// <summary>
    /// Saved state of ONE row of the module catalog pricing save
    /// (PUT /v1/modules/pricing): the three editable GLOBAL catalog price fields, exactly
    /// as they were persisted, plus the resulting effective price.
    /// <para>
    /// Deliberately NOT <see cref="ModuleDto"/>: a save echo is keyed by ModuleId and
    /// carries nothing but the fields the save is allowed to change, so adding a read-only
    /// column to the catalog read can never quietly widen the write contract.
    /// </para>
    /// </summary>
    public sealed class ModuleCatalogPricingDto
    {
        public int ModuleId { get; set; }

        /// <summary>Catalog module name, copied verbatim. Identifies the row in the echo.</summary>
        public string Name { get; set; }

        /// <summary>Base catalog price.</summary>
        public float Price { get; set; }

        /// <summary>Flat (absolute) discount taken off <see cref="Price"/>.</summary>
        public float DiscountPrice { get; set; }

        /// <summary>Percentage discount taken off <see cref="Price"/>, 0-100.</summary>
        public float PercentDiscountPrice { get; set; }

        /// <summary>
        /// <c>CurrentPriceServiceUtils.GetCurrentPrice(price, percentDiscountPrice,
        /// discountPrice)</c> over the three fields above — the same formula
        /// <c>ModuleProfile</c> applies when mapping the catalog read, so the value the
        /// editor shows after a save is the value the read will report.
        /// </summary>
        public float CurrentPrice { get; set; }
    }

    /// <summary>
    /// Result of the module catalog pricing save: the echoed state of every submitted row
    /// plus the total over the whole submitted table.
    /// </summary>
    public sealed class ModuleCatalogPricingResultDto
    {
        /// <summary>
        /// The saved rows, in payload order. Every submitted row is echoed; the payload is
        /// the complete table the editor showed, and every row in it carries a price, so
        /// there is no ticked/unticked distinction here and no rows are filtered out of the total.
        /// </summary>
        public List<ModuleCatalogPricingDto> Modules { get; set; }

        /// <summary>
        /// Σ <see cref="ModuleCatalogPricingDto.CurrentPrice"/> over every submitted row.
        /// <para>
        /// The per-module GROUP totals the editor renders are computed by the browser from
        /// the same three fields; this is the ungrouped sum of the whole table, kept
        /// server-side so the client arithmetic stays pinned to the server formula.
        /// </para>
        /// <para>
        /// Accumulated in <see cref="double"/> from the <see cref="float"/> row values so the
        /// running sum does not inherit float32 rounding as it grows.
        /// </para>
        /// </summary>
        public double TotalCurrentPrice { get; set; }
    }
}
