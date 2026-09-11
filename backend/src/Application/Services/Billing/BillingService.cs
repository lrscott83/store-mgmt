using Application.Abstractions.Time;
using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using Microsoft.Extensions.Caching.Memory;

namespace Application.Services.Billing;

public class BillingService : IBillingService
{
    private readonly IStoreRepository _storeRepository;
    private readonly IStorePaymentRepository _paymentRepository;
    private readonly IModuleRepository _moduleRepository;
    private readonly ISystemConfigurationRepository _configRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IMemoryCache _cache;

    public BillingService(
        IStoreRepository storeRepository,
        IStorePaymentRepository paymentRepository,
        IModuleRepository moduleRepository,
        ISystemConfigurationRepository configRepository,
        IDateTimeProvider dateTimeProvider,
        IMemoryCache cache)
    {
        _storeRepository = storeRepository;
        _paymentRepository = paymentRepository;
        _moduleRepository = moduleRepository;
        _configRepository = configRepository;
        _dateTimeProvider = dateTimeProvider;
        _cache = cache;
    }

    private async Task<T> GetCachedConfigAsync<T>(string key, Func<Task<T>> factory, int expirationMinutes = 5)
    {
        if (_cache.TryGetValue(key, out T? cached))
            return cached!;

        var value = await factory();
        _cache.Set(key, value, TimeSpan.FromMinutes(expirationMinutes));
        return value;
    }

    public async Task<StoreBillingSummary> GetStoreBillingSummaryAsync(Guid storeId)
    {
        // Must include StoreModules: GetByIdAsync is a bare FindAsync and this project has no
        // lazy-loading proxies, so store.StoreModules would always be empty and PlanType would
        // always resolve to "Free".
        var store = await _storeRepository.GetStoreByIdIncludingModulesAsync(storeId);
        if (store is null)
            return new StoreBillingSummary { StoreId = storeId, Status = StoreBillingStatusType.NoAplica, PlanType = "Free" };

        // Disapproved stores pay nothing and never expire — behavior identical to a store whose
        // billing clock never started (PaymentStartDate == null): NoAplica, Free plan, no trial,
        // no due date (product decision 2026-09-10). Reuse the null-clock branch below instead of
        // duplicating it by deriving an effective start date for this computation.
        var billingClockStart = store.Approved ? store.PaymentStartDate : (DateOnly?)null;

        var moduleIds = store.StoreModules.Select(sm => sm.ModuleId);
        var modules = await _moduleRepository.GetModulesByIdsAsync(moduleIds);
        var hasPaidModule = modules.Any(m => !m.PriceIncluded);
        var planType = hasPaidModule && billingClockStart is not null ? "Paid" : "Free";

        // Monto efectivo del plan con los DESCUENTOS del snapshot de la tienda
        // (StoreModule): mismo cálculo que RegisterStorePaymentCommand usa para el
        // cobro. Un plan cuyo valor efectivo es 0 (p.ej. todos los módulos de pago
        // con 100% de descuento) no debe entrar en trial: no hay nada pendiente de
        // cobro, así que el cartel "Probando el plan de pago. Primer cobro..." no
        // aplica (2026-09-06).
        float effectiveAmount = store.StoreModules
            .Where(sm => sm.IsActive && !sm.ModulePriceIncluded)
            .Sum(sm => CurrentPriceServiceUtils.GetCurrentPrice(
                sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));
        var hasBillableAmount = effectiveAmount > 0;

        var lastPayment = await _paymentRepository.GetLastByStoreIdAsync(storeId);
        var paidCount = await _paymentRepository.GetPaidMonthsCountAsync(storeId);

        var graceDays = await GetCachedConfigAsync("PaymentGraceDays", _configRepository.GetPaymentGraceDaysAsync);
        var dueSoonDays = await GetCachedConfigAsync("DueSoonDays", _configRepository.GetDueSoonDaysAsync);
        var trialMonths = Math.Max(1, await GetCachedConfigAsync("TestingPeriodInMonths", _configRepository.GetTestingPeriodInMonthsAsync));

        var nextDueDate = StoreBillingUtils.GetNextDueDate(
            billingClockStart,
            trialMonths,
            lastPayment?.PaymentBeforeDate is DateTimeOffset pbd ? DateOnly.FromDateTime(pbd.UtcDateTime) : null);

        // "Never expire" is absolute: a disapproved store surfaces no due date even when a
        // historical StorePayment row exists (approve → pay → disapprove).
        if (!store.Approved)
            nextDueDate = null;

        var today = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime);
        // Gate de valor 0: sin monto efectivo no hay trial (ni cartel de primer cobro).
        var isInTrial = hasBillableAmount && StoreBillingUtils.IsInTrial(billingClockStart, trialMonths, today);
        var status = StoreBillingUtils.GetStatus(
            billingClockStart,
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

        var monthsActive = billingClockStart is not null
            ? ((today.Year - billingClockStart.Value.Year) * 12) + today.Month - billingClockStart.Value.Month
            : 0;

        return new StoreBillingSummary
        {
            StoreId = storeId,
            StoreName = store.Name,
            PlanType = planType,
            PaymentStartDate = billingClockStart,
            NextDueDate = nextDueDate,
            LastPaidDate = lastPayment?.PaidDate is DateTimeOffset pdo ? DateOnly.FromDateTime(pdo.UtcDateTime) : null,
            Status = status,
            IsInTrial = isInTrial,
            CurrentMonthAmount = currentAmount,
            ReSellerCommission = commission,
            MonthsActive = Math.Max(0, monthsActive),
            MonthsPaid = paidCount,
        };
    }
}
