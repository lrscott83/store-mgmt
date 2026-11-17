using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.StorePayments.Queries.GetStorePaymentsHistory;

/// <summary>Currency tab of the payments-history screen. The tab IS the currency filter (S4).</summary>
public enum StorePaymentHistoryCurrency
{
    Usd = 0,
    Cup = 1,
}

/// <summary>
/// Registered store payments ("cobros realizados") for one currency tab.
/// <see cref="Page"/> is clamped to >= 1 by the handler; the page size is fixed at
/// <see cref="PageSize"/> for v1 (S5).
/// </summary>
public sealed record GetStorePaymentsHistoryQuery(
    StorePaymentHistoryCurrency Currency = StorePaymentHistoryCurrency.Usd,
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
    private const string UsdCurrency = "USD";
    private const string CupCurrency = "CUP";

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
        // S2 — role guard: only SuperAdmin (every store) and ReSeller (its own stores) may read this.
        bool isSuperAdmin = _httpContextService.IsSuperAdmin;
        bool isReSeller = _httpContextService.IsReSeller;

        if (!isSuperAdmin && !isReSeller)
            throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

        var isCup = request.Currency == StorePaymentHistoryCurrency.Cup;
        var page = request.Page < 1 ? 1 : request.Page;

        // S2 — the ReSeller scope is a query argument, never a post-filter in memory.
        var filter = new StorePaymentHistoryFilter(
            IsCup: isCup,
            From: request.From,
            To: request.To,
            StoreId: request.StoreId,
            ReSellerUserId: isSuperAdmin ? null : _httpContextService.UserExternalId.ToGuid(),
            Page: page,
            PageSize: GetStorePaymentsHistoryQuery.PageSize);

        // S9 — the repository aggregates the WHOLE filter in the database; this handler only maps.
        var history = await _paymentRepository.GetHistoryPageAsync(filter, cancellationToken);

        var currency = isCup ? CupCurrency : UsdCurrency;

        var result = new StorePaymentsHistoryDto
        {
            Currency = currency,
            Items = history.Items.Select(row => MapRow(row, isCup, currency)).ToList(),
            Total = history.Total,
            Page = page,
            PageSize = GetStorePaymentsHistoryQuery.PageSize,
            TotalAmount = history.TotalAmount,
            TotalCommission = history.TotalCommission,
            UsdCount = history.UsdCount,
            CupCount = history.CupCount,
        };

        return ResponseResult.Success(result);
    }

    /// <summary>
    /// S7/S10 — a row carries exactly ONE money value, in the tab's currency: <c>Price</c> on USD,
    /// <c>AmountPaid</c> on CUP. The exchange-rate detail exists only on CUP rows, because a USD row
    /// has nothing to explain.
    /// </summary>
    private static StorePaymentHistoryItemDto MapRow(
        StorePaymentHistoryRow row, bool isCup, string currency)
        => new()
        {
            StoreId = row.StoreId,
            StoreName = row.StoreName,
            OwnerName = row.OwnerName,
            PaidDate = row.PaidDate,
            PaymentBeforeDate = row.PaymentBeforeDate,
            // The currency filter guarantees AmountPaid has a value on the CUP tab. The zero below is
            // UNREACHABLE and deliberately not `Price`: falling back to Price would render a USD figure
            // under a CUP label, which is the one mistake this screen must never make (S7/S10).
            Amount = isCup ? (row.AmountPaid ?? 0m) : row.Price,
            Commission = row.Commission,
            Currency = currency,
            ExchangeRate = isCup ? row.ExchangeRate : null,
            AmountOwedUsd = isCup ? row.Price : null,
        };
}
