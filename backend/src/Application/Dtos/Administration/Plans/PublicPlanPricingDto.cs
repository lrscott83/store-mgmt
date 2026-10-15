namespace Application.Dtos.Administration.Plans
{
    /// <summary>
    /// Public plan pricing for the marketing landing (owner request 2026-10-15). Anonymous: it
    /// exposes the plan catalog's real prices, restricted to the modules that are ACTIVE and
    /// AVAILABLE TO STORES (the canonical <c>GetAvailableModulesToStore</c> universe). VIP is
    /// excluded — it is SuperAdmin-reserved in the authenticated catalog.
    ///
    /// Each plan carries its CUMULATIVE module list (a plan includes the previous plan's modules),
    /// exactly as the app shows it.
    /// </summary>
    public sealed class PublicPlanPricingDto
    {
        /// <summary>Plan name, e.g. "Gratis" | "Pago" | "Superior".</summary>
        public string PlanType { get; set; }

        public string Name { get; set; }

        public int Order { get; set; }

        /// <summary>Σ of the BASE (pre-discount) prices of the plan's billable modules.</summary>
        public float BasePrice { get; set; }

        /// <summary>Σ of the EFFECTIVE prices of the plan's billable modules — what is charged.</summary>
        public float CurrentPrice { get; set; }

        public List<PublicPlanModulePricingDto> Modules { get; set; } = new();
    }

    /// <summary>
    /// One row of a public plan card: the module's name and its effective/base price.
    /// A price-included (bundled) module is reported at 0/0 — the owner shows those at price 0.
    /// </summary>
    public sealed class PublicPlanModulePricingDto
    {
        public int ModuleId { get; set; }

        public string Name { get; set; }

        /// <summary>0 when the module is price-included (bundled).</summary>
        public float BasePrice { get; set; }

        /// <summary>Effective price; 0 when the module is price-included.</summary>
        public float CurrentPrice { get; set; }
    }
}
