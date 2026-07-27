using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.StorePayments.Queries.GetStoresToCollect;

public sealed record GetStoresToCollectQuery() : IQuery<IEnumerable<StoreToCollectDto>>;

internal sealed class GetStoresToCollectQueryHandler : IQueryHandler<GetStoresToCollectQuery, IEnumerable<StoreToCollectDto>>
{
    private readonly IStoreRepository _storeRepository;
    private readonly IStorePaymentRepository _storePaymentRepository;
    private readonly ISystemConfigurationRepository _systemConfigurationRepository;
    private readonly IHttpContextService _httpContextService;
    private readonly IStringLocalizer<I18n> _localizer;

    public GetStoresToCollectQueryHandler(
        IStoreRepository storeRepository,
        IStorePaymentRepository storePaymentRepository,
        ISystemConfigurationRepository systemConfigurationRepository,
        IHttpContextService httpContextService,
        IStringLocalizer<I18n> localizer)
    {
        _storeRepository = storeRepository;
        _storePaymentRepository = storePaymentRepository;
        _systemConfigurationRepository = systemConfigurationRepository;
        _httpContextService = httpContextService;
        _localizer = localizer;
    }

    public async Task<ResponseResult<IEnumerable<StoreToCollectDto>>> Handle(
        GetStoresToCollectQuery query, CancellationToken cancellationToken)
    {
        // Role guard: only SuperAdmin or ReSeller can view stores to collect
        bool isSuperAdmin = _httpContextService.IsSuperAdmin;
        bool isReSeller = _httpContextService.IsReSeller;

        if (!isSuperAdmin && !isReSeller)
            throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

        // Load paid stores (all or scoped by reseller)
        IEnumerable<Store> stores = isSuperAdmin
            ? await _storeRepository.GetPaidStoresAsync()
            : await _storeRepository.GetPaidStoresByReSellerUserAsync(_httpContextService.UserExternalId.ToGuid());

        // Compute billing status for each store
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();
        int graceDays = await _systemConfigurationRepository.GetPaymentGraceDaysAsync();
        const int dueSoonDays = 5;

        var result = new List<StoreToCollectDto>();

        foreach (var store in stores)
        {
            // Get last payment for due date computation
            var lastPayment = await _storePaymentRepository.GetLastByStoreIdAsync(store.Id);
            DateOnly? lastPaidBeforeDate = lastPayment is null
                ? null
                : DateOnly.FromDateTime(lastPayment.PaymentBeforeDate.UtcDateTime);

            var nextDueDate = StoreBillingUtils.GetNextDueDate(
                store.PaymentStartDate ?? DateOnly.MaxValue,
                trialMonths,
                lastPaidBeforeDate);

            var status = StoreBillingUtils.GetStatus(
                store.PaymentStartDate,
                nextDueDate,
                today,
                dueSoonDays,
                graceDays);

            // Only include stores that are due soon or in grace period
            if (status != StoreBillingStatusType.PorVencer && status != StoreBillingStatusType.EnGracia)
                continue;

            // Compute amount = sum of GetCurrentPrice for all active, non-free StoreModules
            float amount = store.StoreModules
                .Where(sm => sm.IsActive && !sm.ModulePriceIncluded)
                .Sum(sm => CurrentPriceServiceUtils.GetCurrentPrice(
                    sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));

            result.Add(new StoreToCollectDto
            {
                StoreId = store.Id,
                StoreName = store.Name,
                OwnerName = store.Owner?.User?.FullName ?? "",
                Amount = amount,
                NextDueDate = nextDueDate,
                Status = status.ToString(),
            });
        }

        return ResponseResult.Success(result.OrderBy(r => r.NextDueDate).AsEnumerable());
    }
}