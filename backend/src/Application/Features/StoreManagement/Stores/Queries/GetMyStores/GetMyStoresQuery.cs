using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Queries.GetMyStores
{
    public sealed record GetMyStoresQuery() : IQuery<IEnumerable<OwnerStoreDto>> { }

    /// <summary>
    /// Owner's "my stores" listing: every store the current user owns — active AND
    /// inactive — with the calculated next billing date and the CANONICAL plan price
    /// (Σ over the plan's member modules from the live catalog, same formula PlanProfile
    /// uses for GET /v1/plans), memoized per plan id. Mirrors
    /// GetStoresByCurrentUserQuery's branch-by-role shape: SuperAdmin sees everything;
    /// an OwnerAdmin sees their own stores. ReSeller and StoreUser are rejected, same
    /// gate the other store commands use.
    /// </summary>
    public class GetMyStoresQueryHandler : IQueryHandler<GetMyStoresQuery, IEnumerable<OwnerStoreDto>>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IMapper _mapper;
        private readonly IHttpContextService _httpContextService;
        private readonly IStorePaymentRepository _storePaymentRepository;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;
        private readonly IPlanRepository _planRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetMyStoresQueryHandler(
            IStoreRepository storeRepository,
            IMapper mapper,
            IHttpContextService httpContextService,
            IStorePaymentRepository storePaymentRepository,
            ISystemConfigurationRepository systemConfigurationRepository,
            IPlanRepository planRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _mapper = mapper;
            _httpContextService = httpContextService;
            _storePaymentRepository = storePaymentRepository;
            _systemConfigurationRepository = systemConfigurationRepository;
            _planRepository = planRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<OwnerStoreDto>>> Handle(GetMyStoresQuery request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden);

            var userId = _httpContextService.UserExternalId.ToGuid();
            var stores = _httpContextService.IsSuperAdmin
                ? await _storeRepository.GetAllStoresWithModulesAsync(excludeStoreId: Domain.Common.Constants.DataUtils.DefaultStore.Id)
                : await _storeRepository.GetAllStoresByOwnerUserIdAsync(userId, excludeStoreId: Domain.Common.Constants.DataUtils.DefaultStore.Id);

            // Trial period length is tenant-global: one read up front, shared by every
            // store's nextDueDate calculation below (GetStorePlanQuery reads it per call).
            int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();

            // Canonical plan prices are a pure function of the plan catalog — memoized
            // per plan id: one lookup + one summation per DISTINCT plan, not per store.
            var planPriceCache = new Dictionary<int, (float? Price, float? CurrentPrice)>();

            var dtos = new List<OwnerStoreDto>();
            foreach (var store in stores)
            {
                OwnerStoreDto dto = _mapper.Map<OwnerStoreDto>(store);

                // Next billing date — the exact canonical calculation of
                // GetStorePlanQuery.cs:42-53, so the card shows the same date the
                // dedicated plan view would. N+1 on payments per store is accepted
                // and documented (plan R-2): an owner owns a handful of stores.
                var lastPayment = await _storePaymentRepository.GetLastByStoreIdAsync(store.Id);
                DateOnly? lastPaidBeforeDate = lastPayment is null
                    ? null
                    : DateOnly.FromDateTime(lastPayment.PaymentBeforeDate.UtcDateTime);
                // Disapproved stores expose no payment info: the Approved guard wraps the
                // whole computation (payment, override, clock) — same rule as
                // BillingService.cs:60,72,101-102 and GetStoresByCurrentUserQuery.
                dto.NextDueDate = store.Approved
                    ? StoreBillingUtils.GetNextDueDate(
                        store.PaymentStartDate,
                        trialMonths,
                        lastPaidBeforeDate,
                        store.NextDueDateOverride)
                    : null;

                // Canonical card price (plan 2026-09-15): plan catalog, not the store's
                // StoreModule snapshot. Disapproved stores expose no price — the same
                // Approved guard as the payment date above.
                if (store.Approved)
                {
                    (dto.PlanPrice, dto.PlanCurrentPrice) = await GetPlanPriceAsync(store.StorePlanId, planPriceCache);
                }
                else
                {
                    dto.PlanPrice = null;
                    dto.PlanCurrentPrice = null;
                }

                dtos.Add(dto);
            }

            return ResponseResult.Success((IEnumerable<OwnerStoreDto>)dtos);
        }

        /// <summary>
        /// Σ over the plan's member modules — identical inputs and formula as
        /// PlanProfile's PlanDto.Price mapping (GET /v1/plans), so the card price and
        /// the plan-catalog price are equal by construction. Memoized per plan id.
        /// </summary>
        private async Task<(float? Price, float? CurrentPrice)> GetPlanPriceAsync(
            int storePlanId,
            Dictionary<int, (float? Price, float? CurrentPrice)> cache)
        {
            if (cache.TryGetValue(storePlanId, out var cached))
                return cached;

            var plan = await _planRepository.GetActivePlanWithModulesByIdAsync(storePlanId);
            (float? Price, float? CurrentPrice) result = plan is null
                ? (null, null)
                : PlanPricingUtils.Sum(plan);

            cache[storePlanId] = result;
            return result;
        }
    }
}
