using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.StorePayments;

namespace Domain.Interfaces.Repositories
{
    public interface IStorePaymentRepository : IGenericRepository<StorePayment>
    {
        Task<StorePayment?> GetLastByStoreIdAsync(Guid storeId);
        Task<IEnumerable<StorePayment>> GetByStoreIdAsync(Guid storeId);
        Task<int> GetPaidMonthsCountAsync(Guid storeId);
        Task<bool> AnyByStoreIdsAsync(IEnumerable<Guid> storeIds, CancellationToken cancellationToken = default);
        Task<IEnumerable<StorePayment>> GetAllPaidWithReSellerAsync();
        Task<IEnumerable<StorePayment>> GetPaidWithReSellerByReSellerUserAsync(Guid reSellerUserId);

        /// <summary>
        /// One page of PAID payments for the "cobros realizados" screen (store-payments-history), plus
        /// the aggregates the screen needs. EVERY aggregate here is computed in SQL over the WHOLE
        /// filter — the page size never limits the counts or the sums (S9), and a tab is one currency
        /// so no total ever adds USD to CUP (S10).
        /// </summary>
        Task<StorePaymentHistoryPage> GetHistoryPageAsync(
            StorePaymentHistoryFilter filter, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Filters of the payments-history read. <see cref="Currency"/> is the tab discriminator:
    /// a payment is CUP (<see cref="StorePaymentCurrency.Cup"/>) when <c>AmountPaid</c> has a value
    /// and USD (<see cref="StorePaymentCurrency.Usd"/>) when it is null — one charge, one currency,
    /// never both. <see cref="Page"/> is clamped to >= 1 HERE and nowhere else; the effective values
    /// travel back on <see cref="StorePaymentHistoryPage"/>.
    /// </summary>
    /// <param name="ReSellerUserId">Null for SuperAdmin (every store). A value restricts the query
    /// to the stores that ReSeller owns, using the same predicate as
    /// <c>GetPaidWithReSellerByReSellerUserAsync</c>.</param>
    public sealed record StorePaymentHistoryFilter(
        StorePaymentCurrency Currency,
        DateOnly? From,
        DateOnly? To,
        Guid? StoreId,
        Guid? ReSellerUserId,
        int Page,
        int PageSize);

    /// <summary>
    /// A single payments-history row, already normalised to money at 2-decimal granularity.
    /// <see cref="Amount"/> is NON-NULL and already selected for the requested currency
    /// (<c>AmountPaid</c> on CUP, <c>Price</c> on USD), so no consumer ever has to invent a value.
    /// <see cref="Price"/> travels alongside only because a CUP row needs it as the USD "Debía";
    /// nothing here sums the two.
    /// </summary>
    public sealed record StorePaymentHistoryRow(
        Guid StoreId,
        string StoreName,
        string OwnerName,
        DateTimeOffset? PaidDate,
        DateTimeOffset PaymentBeforeDate,
        decimal Amount,
        decimal Commission,
        decimal? ExchangeRate,
        decimal Price);

    /// <summary>
    /// One page plus the filter-wide aggregates. <see cref="Total"/> is the row count of the SELECTED
    /// currency; <see cref="UsdCount"/> and <see cref="CupCount"/> are both always present so the tab
    /// labels need no second request (S6). <see cref="Page"/> and <see cref="PageSize"/> are the
    /// EFFECTIVE values the repository used — the caller echoes them instead of re-doing the math.
    /// </summary>
    public sealed record StorePaymentHistoryPage(
        IReadOnlyList<StorePaymentHistoryRow> Items,
        int Total,
        decimal TotalAmount,
        decimal TotalCommission,
        int UsdCount,
        int CupCount,
        int Page,
        int PageSize);
}
