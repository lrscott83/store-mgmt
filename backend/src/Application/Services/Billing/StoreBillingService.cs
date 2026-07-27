using Domain.Common.Enums;
using Domain.Common.Utils;
using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;

namespace Application.Services.Billing;

public class StoreBillingService : IStoreBillingService
{
    private readonly IStoreRepository _storeRepository;
    private readonly IStorePaymentRepository _paymentRepository;
    private readonly ISystemConfigurationRepository _configRepository;

    public StoreBillingService(
        IStoreRepository storeRepository,
        IStorePaymentRepository paymentRepository,
        ISystemConfigurationRepository configRepository)
    {
        _storeRepository = storeRepository;
        _paymentRepository = paymentRepository;
        _configRepository = configRepository;
    }

    public async Task RecordManualPaymentAsync(Guid storeId, float amount, Guid? reSellerId,
        float reSellerPercentDiscountPrice, float reSellerDiscountPrice,
        Guid tenantId)
    {
        var store = await _storeRepository.GetByIdAsync(storeId);
        if (store is null)
            throw new KeyNotFoundException($"Store with id {storeId} not found.");

        var lastPayment = await _paymentRepository.GetLastByStoreIdAsync(storeId);

        var trialMonths = await _configRepository.GetTestingPeriodInMonthsAsync();

        var nextDueDate = StoreBillingUtils.GetNextDueDate(
            store.PaymentStartDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            trialMonths,
            lastPayment?.PaymentBeforeDate is DateTimeOffset pbd ? DateOnly.FromDateTime(pbd.UtcDateTime) : null);

        // Compute reseller commission
        float commission = StoreBillingUtils.GetReSellerCommission(
            amount, reSellerPercentDiscountPrice, reSellerDiscountPrice);

        var payment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: amount,
            paymentBeforeDate: new DateTimeOffset(nextDueDate.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            year: nextDueDate.Year,
            month: nextDueDate.Month,
            tenantId: tenantId,
            reSellerId: reSellerId,
            reSellerPercentDiscountPrice: reSellerPercentDiscountPrice,
            reSellerDiscountPrice: reSellerDiscountPrice,
            reSellerAmount: commission,
            byReSeller: reSellerId.HasValue);

        await _paymentRepository.AddAsync(payment);
    }

    public async Task<IEnumerable<StorePayment>> GetCollectionsAsync(Guid storeId)
    {
        return await _paymentRepository.GetByStoreIdAsync(storeId);
    }

    public async Task<float> GetReSellerCommissionsAsync(Guid storeId, DateOnly? fromDate, DateOnly? toDate)
    {
        var payments = await _paymentRepository.GetByStoreIdAsync(storeId);

        var filtered = payments.Where(p => p.ReSellerId.HasValue && p.ReSellerAmount > 0);

        if (fromDate.HasValue)
        {
            filtered = filtered.Where(p =>
                p.Year > fromDate.Value.Year ||
                (p.Year == fromDate.Value.Year && p.Month >= fromDate.Value.Month));
        }

        if (toDate.HasValue)
        {
            filtered = filtered.Where(p =>
                p.Year < toDate.Value.Year ||
                (p.Year == toDate.Value.Year && p.Month <= toDate.Value.Month));
        }

        return filtered.Sum(p => p.ReSellerAmount);
    }
}
