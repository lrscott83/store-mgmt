namespace Application.Dtos.Administration.Plans
{
    /// <summary>
    /// Plan catalog entry backing the frontend three-panel UI. Excludes VIP
    /// (repository-level filter); price is the Σ of member module currentPrices.
    /// </summary>
    public sealed class PlanDto
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public int Order { get; set; }
        public string PlanType { get; set; }
        public float Price { get; set; }
        public List<PlanModuleDto> Modules { get; set; } = new();
    }
}