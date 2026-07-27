using Domain.Entities.Billing;

namespace Domain.Interfaces.Services.Billing;

public interface IBillingService
{
    Task<StoreBillingSummary> GetStoreBillingSummaryAsync(Guid storeId);
}
