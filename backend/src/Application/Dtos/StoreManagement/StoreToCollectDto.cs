namespace Application.Dtos.StoreManagement
{
    public sealed class StoreToCollectDto
    {
        public Guid StoreId { get; set; }
        public string StoreName { get; set; } = string.Empty;
        public string OwnerName { get; set; } = string.Empty;
        public float Amount { get; set; }

        /// <summary>
        /// The pre-discount total of the same billable rows <see cref="Amount"/> is computed from,
        /// as returned by <c>ModulePriceCalculator.CalculateBaseTotal</c> over
        /// <c>store.StoreModules</c>. Both columns re-use the same <c>IsBillable</c> predicate and
        /// the same <c>Module.IsActive</c> filter, so <c>Amount &lt;= BaseAmount</c> always holds,
        /// and a discount exists exactly when the two differ.
        /// </summary>
        public float BaseAmount { get; set; }

        public DateOnly? NextDueDate { get; set; }
        public string Status { get; set; } = string.Empty;
    }
}