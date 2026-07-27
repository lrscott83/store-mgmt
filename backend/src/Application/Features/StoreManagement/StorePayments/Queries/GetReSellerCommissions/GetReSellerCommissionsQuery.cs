using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.StorePayments.Queries.GetReSellerCommissions;

public sealed record GetReSellerCommissionsQuery() : IQuery<IEnumerable<ReSellerCommissionDto>>;

internal sealed class GetReSellerCommissionsQueryHandler
    : IQueryHandler<GetReSellerCommissionsQuery, IEnumerable<ReSellerCommissionDto>>
{
    private readonly IStorePaymentRepository _paymentRepository;
    private readonly IHttpContextService _httpContextService;
    private readonly IStringLocalizer<I18n> _localizer;

    public GetReSellerCommissionsQueryHandler(
        IStorePaymentRepository paymentRepository,
        IHttpContextService httpContextService,
        IStringLocalizer<I18n> localizer)
    {
        _paymentRepository = paymentRepository;
        _httpContextService = httpContextService;
        _localizer = localizer;
    }

    public async Task<ResponseResult<IEnumerable<ReSellerCommissionDto>>> Handle(
        GetReSellerCommissionsQuery request, CancellationToken cancellationToken)
    {
        bool isSuperAdmin = _httpContextService.IsSuperAdmin;
        bool isReSeller = _httpContextService.IsReSeller;

        if (!isSuperAdmin && !isReSeller)
            throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

        IEnumerable<StorePayment> payments;

        if (isSuperAdmin)
        {
            payments = await _paymentRepository.GetAllPaidWithReSellerAsync();
        }
        else
        {
            var reSellerUserId = _httpContextService.UserExternalId.ToGuid();
            payments = await _paymentRepository.GetPaidWithReSellerByReSellerUserAsync(reSellerUserId);
        }

        var result = payments
            .GroupBy(p => new { p.Year, p.Month })
            .Select(g => new ReSellerCommissionDto
            {
                Year = g.Key.Year,
                Month = g.Key.Month,
                PaymentCount = g.Count(),
                TotalCommission = g.Sum(p => p.ReSellerAmount),
            })
            .OrderByDescending(r => r.Year)
            .ThenByDescending(r => r.Month)
            .ToList();

        return ResponseResult.Success(result.AsEnumerable());
    }
}