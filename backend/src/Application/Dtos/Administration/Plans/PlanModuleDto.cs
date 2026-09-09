namespace Application.Dtos.Administration.Plans
{
    /// <summary>
    /// Plan member module row. Prices come from the live module catalog (not the
    /// store snapshot), computed with the same <c>CurrentPriceServiceUtils</c> as
    /// the module catalog endpoint.
    /// </summary>
    public sealed class PlanModuleDto
    {
        public int ModuleId { get; set; }
        public string Name { get; set; }
        public int Order { get; set; }
        public bool PriceIncluded { get; set; }
        public float Price { get; set; }
        public float CurrentPrice { get; set; }
        public float DiscountPrice { get; set; }
        public float PercentDiscountPrice { get; set; }
        public string DiscountText { get; set; }
        public List<string> FeatureDescriptions { get; set; } = new();
    }
}