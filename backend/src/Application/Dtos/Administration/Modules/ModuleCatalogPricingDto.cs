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
        /// Additive: the module's catalog <c>PriceIncluded</c>. Read-only — the save never owns it.
        /// It is one of the two inputs THE price rule reads
        /// (<c>ModulePriceCalculator.IsBillable = IsActive &amp;&amp; !PriceIncluded</c>), so a
        /// client can tell a billable row from one dropped from
        /// <see cref="ModuleCatalogPricingResultDto.TotalCurrentPrice"/>.
        /// </summary>
        public bool PriceIncluded { get; set; }

        /// <summary>
        /// Additive: the module's catalog <c>IsActive</c>. Read-only, and the other input to the
        /// price rule — an inactive module never reaches the total.
        /// </summary>
        public bool IsActive { get; set; }

        /// <summary>
        /// <c>CurrentPriceServiceUtils.GetCurrentPrice(price, percentDiscountPrice,
        /// discountPrice)</c> over the three fields above — the same formula
        /// <c>ModuleProfile</c> applies when mapping the catalog read, so the value the
        /// editor shows after a save is the value the read will report.
        /// <para>
        /// Reported for EVERY row, billable or not. Only the billable rows
        /// (<see cref="IsActive"/> &amp;&amp; !<see cref="PriceIncluded"/>) reach
        /// <see cref="ModuleCatalogPricingResultDto.TotalCurrentPrice"/>.
        /// </para>
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
        /// the complete table the editor showed. Every row in it carries a price, so there
        /// is no ticked/unticked distinction here and no row is filtered OUT of the echo —
        /// but only the BILLABLE ones reach <see cref="TotalCurrentPrice"/>.
        /// </summary>
        public List<ModuleCatalogPricingDto> Modules { get; set; }

        /// <summary>
        /// Σ <see cref="ModuleCatalogPricingDto.CurrentPrice"/> over the BILLABLE rows only —
        /// <see cref="ModuleCatalogPricingDto.IsActive"/> &amp;&amp;
        /// !<see cref="ModuleCatalogPricingDto.PriceIncluded"/>, i.e. THE single price rule
        /// (<c>ModulePriceCalculator</c>). Previously this summed EVERY submitted row, so an
        /// inactive or gratis module inflated the editor total.
        /// <para>
        /// Computed by <c>ModulePriceCalculator.CalculateTotal</c>, which accumulates the
        /// <see cref="float"/> row values through LINQ <c>Sum</c> (double accumulation, cast
        /// back to <see cref="float"/>) so the result is bit-identical to the rest of the
        /// system. The widening to <see cref="double"/> here is exact, never rounded.
        /// </para>
        /// </summary>
        public double TotalCurrentPrice { get; set; }
    }
}
