using Domain.Entities.StorePayments;

namespace Domain.Interfaces.Services.Billing;

public interface IStoreBillingService
{
    Task RecordManualPaymentAsync(Guid storeId, float amount, Guid? reSellerId,
        float reSellerPercentDiscountPrice, float reSellerDiscountPrice,
        Guid tenantId);

    Task<IEnumerable<StorePayment>> GetCollectionsAsync(Guid storeId);

    Task<float> GetReSellerCommissionsAsync(Guid storeId, DateOnly? fromDate, DateOnly? toDate);
}
