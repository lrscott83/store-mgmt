using Application.Dtos.Administration.Modules;

namespace Application.Dtos.StoreManagement
{
    /// <summary>
    /// Owner's "my stores" listing item: every store the current OwnerAdmin owns
    /// (active AND inactive), with the store's module price snapshot and the
    /// calculated next billing date. Distinct from <see cref="StoreDto"/> — that
    /// one backs the plain listings and never carries modules or nextDueDate.
    /// </summary>
    public sealed class OwnerStoreDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public bool IsActive { get; set; }
        public bool Approved { get; set; }
        /// <summary>Null when the store never activated the paid plan.</summary>
        public DateOnly? PaymentStartDate { get; set; }
        /// <summary>
        /// Same canonical calculation as GetStorePlanQuery: first due = activation
        /// + trial + 1 post-paid month; afterwards the latest paid PaymentBeforeDate.
        /// Null when the billing clock never started (paymentStartDate null).
        /// </summary>
        public DateOnly? NextDueDate { get; set; }
        /// <summary>Store's own module snapshot (prices frozen at activation).</summary>
        public List<ModuleDto> Modules { get; set; } = new();
        /// <summary>
        /// The store's current plan name (Gratis, Pago or Superior) serialized
        /// from <c>Store.StorePlanId</c>, so the frontend never infers it.
        /// </summary>
        public string PlanType { get; set; }
        /// <summary>
        /// CANONICAL plan price (docs/plans/2026-09-15-store-plan-canonical-price-plan.md):
        /// Σ over the plan's member MODULES from the live catalog with the same formula
        /// PlanProfile uses for GET /v1/plans — NOT the store's frozen StoreModule
        /// snapshot. Null when the store is disapproved or its plan is missing/inactive.
        /// </summary>
        public float? PlanPrice { get; set; }
        public float? PlanCurrentPrice { get; set; }
    }
}
