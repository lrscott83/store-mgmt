using Domain.Common.Utils;

namespace Domain.Entities.Billing;

public class StoreBillingSummary
{
    public Guid StoreId { get; init; }
    public string StoreName { get; init; } = string.Empty;
    public string PlanType { get; init; } = string.Empty; // "Free" or "Paid"
    public DateOnly? PaymentStartDate { get; init; }
    public DateOnly? NextDueDate { get; init; }
    public DateOnly? LastPaidDate { get; init; }
    public StoreBillingStatusType Status { get; init; }
    public float CurrentMonthAmount { get; init; }
    public float ReSellerCommission { get; init; }
    public int MonthsActive { get; init; }
    public int MonthsPaid { get; init; }
}
