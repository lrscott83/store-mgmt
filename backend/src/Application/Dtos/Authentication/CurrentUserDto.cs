using Domain.Common.Utils;

namespace Application.Dtos.Authentication
{
    public sealed class CurrentUserDto
    {
        public Guid Id { get; set; }
        public string Login { get; set; }
        public string FullName { get; set; }
        public string? CellPhone { get; set; }
        public string? Email { get; set; }
        public ICollection<StoreModuleFeaturesDto> Roles { get; set; }
        public bool IsSuperAdmin { get; set; }
        public bool IsOwnerAdmin { get; set; }
        public bool IsReSeller { get; set; }
        public Guid SelectedStoreId { get; set; }
        public List<int> FeatureIds { get; set; } = new List<int>();
        public List<int> StoreModuleIds { get; set; } = new List<int>();
        public bool IsActive { get; set; }
        public DateOnly? PaymentDueDate { get; set; }
        public bool IsInTrial { get; set; }
        public string PaymentStatus { get; set; } = StoreBillingStatusType.NoAplica.ToString();
        public string PlanType { get; set; } = "Free";
    }
}
