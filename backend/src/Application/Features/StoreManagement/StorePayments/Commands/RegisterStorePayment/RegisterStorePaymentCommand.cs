using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.StorePayments.Commands.RegisterStorePayment;

public sealed record RegisterStorePaymentCommand(Guid StoreId) : ICommand<bool>;

internal sealed class RegisterStorePaymentCommandHandler : ICommandHandler<RegisterStorePaymentCommand, bool>
{
    private readonly IApplicationUnitOfWork _applicationUnitOfWork;
    private readonly IStoreRepository _storeRepository;
    private readonly IStorePaymentRepository _storePaymentRepository;
    private readonly ISystemConfigurationRepository _systemConfigurationRepository;
    private readonly IHttpContextService _httpContextService;
    private readonly IStringLocalizer<I18n> _localizer;

    public RegisterStorePaymentCommandHandler(
        IApplicationUnitOfWork applicationUnitOfWork,
        IStoreRepository storeRepository,
        IStorePaymentRepository storePaymentRepository,
        ISystemConfigurationRepository systemConfigurationRepository,
        IHttpContextService httpContextService,
        IStringLocalizer<I18n> localizer)
    {
        _applicationUnitOfWork = applicationUnitOfWork;
        _storeRepository = storeRepository;
        _storePaymentRepository = storePaymentRepository;
        _systemConfigurationRepository = systemConfigurationRepository;
        _httpContextService = httpContextService;
        _localizer = localizer;
    }

    public async Task<ResponseResult<bool>> Handle(RegisterStorePaymentCommand request, CancellationToken cancellationToken)
    {
        // Role guard: only SuperAdmin or ReSeller can record payments
        bool isSuperAdmin = _httpContextService.IsSuperAdmin;
        bool isReSeller = _httpContextService.IsReSeller;

        if (!isSuperAdmin && !isReSeller)
            throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

        // Load store with modules + reseller ownership
        var store = await _storeRepository.GetStoreWithModulesAndReSellerOwnerAsync(request.StoreId);
        if (store is null)
            throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

        // If not SuperAdmin, verify reseller owns this store
        if (!isSuperAdmin)
        {
            var reSellerUserId = _httpContextService.UserExternalId.ToGuid();
            bool ownsStore = await _storeRepository.IsStoreOwnedByReSellerUserAsync(request.StoreId, reSellerUserId);
            if (!ownsStore)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);
        }

        // Store must have been activated (PaymentStartDate != null)
        if (store.PaymentStartDate is null)
            throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

        // Compute amount = sum of GetCurrentPrice for all active, non-free StoreModules
        float amount = store.StoreModules
            .Where(sm => sm.IsActive && !sm.ModulePriceIncluded)
            .Sum(sm => CurrentPriceServiceUtils.GetCurrentPrice(sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));

        // Snapshot ReSellerOwner data for commission
        var reSellerOwner = store.Owner?.ReSellerOwner;
        Guid? reSellerId = reSellerOwner?.ReSellerId;
        float reSellerPercentDiscountPrice = reSellerOwner?.PercentDiscountPrice ?? 0f;
        float reSellerDiscountPrice = reSellerOwner?.DiscountPrice ?? 0f;
        float reSellerAmount = reSellerOwner is null
            ? 0f
            : StoreBillingUtils.GetReSellerCommission(amount, reSellerPercentDiscountPrice, reSellerDiscountPrice);

        // Determine next due date (advance by 1 month)
        int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();
        var lastPayment = await _storePaymentRepository.GetLastByStoreIdAsync(request.StoreId);
        DateOnly? lastPaidBeforeDate = lastPayment is null
            ? null
            : DateOnly.FromDateTime(lastPayment.PaymentBeforeDate.UtcDateTime);
        DateOnly currentDue = StoreBillingUtils.GetNextDueDate(store.PaymentStartDate.Value, trialMonths, lastPaidBeforeDate) ?? store.PaymentStartDate.Value;
        DateOnly newDue = currentDue.AddMonths(1);

        // Create StorePayment with status Paid
        var now = DateTimeOffset.UtcNow;
        var payment = StorePayment.Create(
            storeId: store.Id,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: amount,
            paymentBeforeDate: new DateTimeOffset(newDue.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            year: newDue.Year,
            month: newDue.Month,
            tenantId: store.TenantId,
            reSellerId: reSellerId,
            reSellerPercentDiscountPrice: reSellerPercentDiscountPrice,
            reSellerDiscountPrice: reSellerDiscountPrice,
            reSellerAmount: reSellerAmount,
            byReSeller: isReSeller);

        await _storePaymentRepository.AddAsync(payment);
        await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
        return ResponseResult.Success(true);
    }
}
