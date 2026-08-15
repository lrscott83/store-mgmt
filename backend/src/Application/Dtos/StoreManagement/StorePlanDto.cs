using Application.Dtos.Administration.Modules;

namespace Application.Dtos.StoreManagement
{
    /// <summary>
    /// Plan-only projection of a store, backing the dedicated plan view
    /// (frontend <c>/management/stores</c>). Carries the store fields the plan
    /// save round-trip needs (so a plan-only PUT never wipes them) plus the
    /// store's active modules.
    /// </summary>
    public sealed class StorePlanDto
    {
        public Guid StoreId { get; set; }
        public string StoreName { get; set; }
        public string? Address { get; set; }
        public string? Description { get; set; }
        public bool Approved { get; set; }
        public bool IsActive { get; set; }
        public DateOnly? PaymentStartDate { get; set; }
        public List<ModuleDto> Modules { get; set; } = new();
    }
}
