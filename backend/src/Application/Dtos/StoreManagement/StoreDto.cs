using Application.Dtos.Administration.Modules;

namespace Application.Dtos.StoreManagement
{
    public sealed class StoreDto 
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public string DisplayName { get; set; }
        public Guid OwnerId { get; set; }
        public string? OwnerName { get; set; }
        public string? Address { get; set; }
        public string? Description { get; set; }
        public bool IsActive { get; set; }
        public bool Approved { get; set; }
        public DateOnly PaymentStartDate { get; set; }
        public DateOnly NextPaymentDate { get; set; }
        public List<ModuleDto> Modules { get; set; }
    }
}
