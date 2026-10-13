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
        // The store's BILLING price: the original (pre-discount) sum over the modules the
        // store has ASSIGNED and that are ACTIVE and not price-included
        // (ModulePriceCalculator.CalculateBaseTotal) — NOT the plan catalog's total, so a
        // store whose module set differs from its plan shows what it actually pays.
        // PlanCurrentPrice is the same rows at their effective (discounted) price.
        // Null when the store is disapproved, so the frontend hides the price row instead
        // of inventing one.
        public float? PlanPrice { get; set; }
        public float? PlanCurrentPrice { get; set; }
        public List<ModuleDto> Modules { get; set; } = new();
    }
}
