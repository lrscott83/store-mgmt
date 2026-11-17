using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.StorePayments.Queries.GetStorePaymentsHistory;

/// <summary>
/// Registered store payments ("cobros realizados") for one currency tab.
/// <see cref="Page"/> is clamped to >= 1 by the repository — the single clamp — and the effective
/// page/page-size come back on the response; the page size is fixed at <see cref="PageSize"/> for v1 (S5).
/// </summary>
public sealed record GetStorePaymentsHistoryQuery(
    StorePaymentCurrency Currency = StorePaymentCurrency.Usd,
    DateOnly? From = null,
    DateOnly? To = null,
    Guid? StoreId = null,
    int Page = 1) : IQuery<StorePaymentsHistoryDto>
{
    /// <summary>Fixed page size for v1 (S5).</summary>
    public const int PageSize = 50;
}

internal sealed class GetStorePaymentsHistoryQueryHandler
    : IQueryHandler<GetStorePaymentsHistoryQuery, StorePaymentsHistoryDto>
{
    private readonly IStorePaymentRepository _paymentRepository;
    private readonly IHttpContextService _httpContextService;
    private readonly IStringLocalizer<I18n> _localizer;

    public GetStorePaymentsHistoryQueryHandler(
        IStorePaymentRepository paymentRepository,
        IHttpContextService httpContextService,
        IStringLocalizer<I18n> localizer)
    {
        _paymentRepository = paymentRepository;
        _httpContextService = httpContextService;
        _localizer = localizer;
    }

    public async Task<ResponseResult<StorePaymentsHistoryDto>> Handle(
        GetStorePaymentsHistoryQuery request, CancellationToken cancellationToken)
    {
        // S2 — role guard. This is a BACKSTOP, not the primary check: `[HasPermission]` on the action
        // admits exactly SuperAdmin and ReSeller for StoreRoleFeatures.StorePaymentAdmin, which
        // declares [HasRoles(SuperAdmin, ReSeller)]. The branch exists so the handler cannot serve
        // data on a future path that forgets the attribute — and it reports the real cause (403, not
        // a 400 "user not found", which would name a condition that is not the problem).
        bool isSuperAdmin = _httpContextService.IsSuperAdmin;
        bool isReSeller = _httpContextService.IsReSeller;

        if (!isSuperAdmin && !isReSeller)
            throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.Forbidden);

        // S2 — the ReSeller scope is a query argument, never a post-filter in memory. Page clamping
        // happens in the repository, once (see the repository's GetHistoryPageAsync).
        var filter = new StorePaymentHistoryFilter(
            Currency: request.Currency,
            From: request.From,
            To: request.To,
            StoreId: request.StoreId,
            ReSellerUserId: isSuperAdmin ? null : _httpContextService.UserExternalId.ToGuid(),
            Page: request.Page,
            PageSize: GetStorePaymentsHistoryQuery.PageSize);

        // S9 — the repository aggregates the WHOLE filter in the database; this handler only maps.
        var history = await _paymentRepository.GetHistoryPageAsync(filter, cancellationToken);

        // S13 — the wire string is produced in exactly one place: StorePaymentCurrency.ToWireValue().
        var currency = request.Currency.ToWireValue();

        var result = new StorePaymentsHistoryDto
        {
            Currency = currency,
            Items = history.Items
                .Select(row => MapRow(row, request.Currency, currency))
                .ToList(),
            Total = history.Total,
            // The repository's effective values, echoed — this handler does no page arithmetic.
            Page = history.Page,
            PageSize = history.PageSize,
            TotalAmount = history.TotalAmount,
            TotalCommission = history.TotalCommission,
            UsdCount = history.UsdCount,
            CupCount = history.CupCount,
        };

        return ResponseResult.Success(result);
    }

    /// <summary>
    /// S7/S10 — a row carries exactly ONE money value, already selected for the tab's currency by the
    /// repository. Nothing is defaulted or derived here. The exchange-rate detail exists only on CUP
    /// rows, because a USD row has nothing to explain.
    /// </summary>
    private static StorePaymentHistoryItemDto MapRow(
        StorePaymentHistoryRow row, StorePaymentCurrency currency, string wireCurrency)
        => new()
        {
            StoreId = row.StoreId,
            StoreName = row.StoreName,
            OwnerName = row.OwnerName,
            PaidDate = row.PaidDate,
            PaymentBeforeDate = row.PaymentBeforeDate,
            Amount = row.Amount,
            Commission = row.Commission,
            Currency = wireCurrency,
            ExchangeRate = currency == StorePaymentCurrency.Cup ? row.ExchangeRate : null,
            AmountOwedUsd = currency == StorePaymentCurrency.Cup ? row.Price : null,
        };
}
