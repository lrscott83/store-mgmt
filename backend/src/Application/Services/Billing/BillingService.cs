using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;

namespace Application.Services.Billing;

public class BillingService : IBillingService
{
    private readonly IStoreRepository _storeRepository;
    private readonly IStorePaymentRepository _paymentRepository;
    private readonly IModuleRepository _moduleRepository;
    private readonly ISystemConfigurationRepository _configRepository;

    public BillingService(
        IStoreRepository storeRepository,
        IStorePaymentRepository paymentRepository,
        IModuleRepository moduleRepository,
        ISystemConfigurationRepository configRepository)
    {
        _storeRepository = storeRepository;
        _paymentRepository = paymentRepository;
        _moduleRepository = moduleRepository;
        _configRepository = configRepository;
    }

    public async Task<StoreBillingSummary> GetStoreBillingSummaryAsync(Guid storeId)
    {
        var store = await _storeRepository.GetByIdAsync(storeId);
        if (store is null)
            return new StoreBillingSummary { StoreId = storeId, Status = StoreBillingStatusType.NoAplica };

        var moduleIds = store.StoreModules.Select(sm => sm.ModuleId);
        var modules = await _moduleRepository.GetModulesByIdsAsync(moduleIds);
        var hasPaidModule = modules.Any(m => !m.PriceIncluded);
        var planType = hasPaidModule && store.PaymentStartDate is not null ? "Paid" : "Free";

        var lastPayment = await _paymentRepository.GetLastByStoreIdAsync(storeId);
        var paidCount = await _paymentRepository.GetPaidMonthsCountAsync(storeId);

        var graceDays = await _configRepository.GetPaymentGraceDaysAsync();
        var trialDays = await _configRepository.GetTestingPeriodInMonthsAsync();
        var dueSoonDays = 5; // fixed due-soon window
        var trialMonths = Math.Max(1, trialDays); // trial is already in months

        var nextDueDate = StoreBillingUtils.GetNextDueDate(
            store.PaymentStartDate ?? DateOnly.MaxValue,
            trialMonths,
            lastPayment?.PaymentBeforeDate is DateTimeOffset pbd ? DateOnly.FromDateTime(pbd.UtcDateTime) : null);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var status = StoreBillingUtils.GetStatus(
            store.PaymentStartDate,
            nextDueDate,
            today,
            dueSoonDays,
            graceDays);

        float currentAmount = 0;
        if (hasPaidModule)
        {
            currentAmount = lastPayment?.Price ?? modules.Where(m => !m.PriceIncluded).Sum(m => m.Price);
        }

        float commission = 0;
        if (lastPayment?.ByReSeller == true)
        {
            commission = StoreBillingUtils.GetReSellerCommission(
                currentAmount,
                lastPayment.ReSellerPercentDiscountPrice,
                lastPayment.ReSellerDiscountPrice);
        }

        var monthsActive = store.PaymentStartDate is not null
            ? ((today.Year - store.PaymentStartDate.Value.Year) * 12) + today.Month - store.PaymentStartDate.Value.Month
            : 0;

        return new StoreBillingSummary
        {
            StoreId = storeId,
            StoreName = store.Name,
            PlanType = planType,
            PaymentStartDate = store.PaymentStartDate,
            NextDueDate = nextDueDate,
            LastPaidDate = lastPayment?.PaidDate is DateTimeOffset pdo ? DateOnly.FromDateTime(pdo.UtcDateTime) : null,
            Status = status,
            CurrentMonthAmount = currentAmount,
            ReSellerCommission = commission,
            MonthsActive = Math.Max(0, monthsActive),
            MonthsPaid = paidCount,
        };
    }
}
