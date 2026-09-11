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
        public string? OwnerPhone { get; set; }
        public string? Address { get; set; }
        public string? Description { get; set; }
        public bool IsActive { get; set; }
        public bool Approved { get; set; }
        public DateOnly? PaymentStartDate { get; set; }
        // Nullable: null when the billing clock never started (PaymentStartDate null) —
        // same contract as OwnerStoreDto.NextDueDate / StorePlanDto.NextDueDate. The
        // handler computes it with the canonical StoreBillingUtils.GetNextDueDate.
        public DateOnly? NextPaymentDate { get; set; }
        // Backend-serialized plan name ("Gratis" | "Pago" | "Superior" | "VIP") from
        // Store.StorePlanId — same source as StorePlanDto.PlanType. The super-admin
        // store cards and the plan filter read it; the frontend never infers the
        // plan from module flags.
        public string? PlanType { get; set; }
        public List<ModuleDto> Modules { get; set; } = new();
    }
}
