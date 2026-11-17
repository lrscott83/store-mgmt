namespace Application.Dtos.StoreManagement;

/// <summary>
/// One page of "cobros realizados" (store-payments-history) for ONE currency tab, plus the
/// aggregates the screen renders. Contract: S13 of <c>odd/tasks/store-payments-history.md</c>.
/// </summary>
public sealed class StorePaymentsHistoryDto
{
    /// <summary>Selected tab: <c>USD</c> or <c>CUP</c>. Every item shares it.</summary>
    public string Currency { get; set; } = "USD";

    public IReadOnlyList<StorePaymentHistoryItemDto> Items { get; set; } = [];

    /// <summary>Row count of the selected currency over the whole filter (all pages).</summary>
    public int Total { get; set; }

    public int Page { get; set; }
    public int PageSize { get; set; }

    /// <summary>Sum of <c>amount</c> over the whole filter, in the selected currency.</summary>
    public decimal TotalAmount { get; set; }

    /// <summary>Sum of <c>commission</c> over the whole filter, in the selected currency.</summary>
    public decimal TotalCommission { get; set; }

    /// <summary>USD row count under the current filters — feeds the USD tab label, whatever tab is selected.</summary>
    public int UsdCount { get; set; }

    /// <summary>CUP row count under the current filters — feeds the CUP tab label, whatever tab is selected.</summary>
    public int CupCount { get; set; }
}

/// <summary>
/// A single registered payment. It is ONE charge in ONE currency: <see cref="Amount"/> is
/// <c>Price</c> on the USD tab and <c>AmountPaid</c> on the CUP tab, and
/// <see cref="ExchangeRate"/>/<see cref="AmountOwedUsd"/> exist only on CUP rows.
/// </summary>
public sealed class StorePaymentHistoryItemDto
{
    public Guid StoreId { get; set; }
    public string StoreName { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public DateTimeOffset? PaidDate { get; set; }
    public DateTimeOffset PaymentBeforeDate { get; set; }

    /// <summary>Charged amount, in <see cref="Currency"/>.</summary>
    public decimal Amount { get; set; }

    /// <summary>ReSellerAmount, same currency as <see cref="Amount"/>.</summary>
    public decimal Commission { get; set; }

    /// <summary>Currency of <see cref="Amount"/> and <see cref="Commission"/>: <c>USD</c> or <c>CUP</c>.</summary>
    public string Currency { get; set; } = "USD";

    /// <summary>CUP per 1 USD. CUP rows only; null on USD rows.</summary>
    public decimal? ExchangeRate { get; set; }

    /// <summary>What was owed in USD (<c>Price</c>). CUP rows only; null on USD rows.</summary>
    public decimal? AmountOwedUsd { get; set; }
}
