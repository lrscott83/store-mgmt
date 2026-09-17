using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Constants;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Interfaces.Repositories;
using Microsoft.AspNetCore.Http;

namespace Application.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser
{
    public sealed record GetStoresByCurrentUserQuery() : IQuery<IEnumerable<StoreDto>> { }

    /// <summary>
    /// Store listing by role (SuperAdmin sees every store cross-tenant; ReSeller and
    /// OwnerAdmin see their own). Besides mapping the entity, computes each store's
    /// NextPaymentDate with the canonical GetNextDueDate calculation — the super-admin
    /// store cards show plan + price + next payment date. The card price is the
    /// CANONICAL plan price (Σ over the plan's member modules from the live catalog,
    /// same formula PlanProfile uses for GET /v1/plans), memoized per plan id —
    /// never the store's frozen StoreModule snapshot (plan 2026-09-15).
    /// </summary>
    public class GetStoresByCurrentUserQueryHandler : IQueryHandler<GetStoresByCurrentUserQuery, IEnumerable<StoreDto>>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IMapper _mapper;
        private readonly IHttpContextService _httpContextService;
        private readonly IStorePaymentRepository _storePaymentRepository;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;
        private readonly IPlanRepository _planRepository;

        public GetStoresByCurrentUserQueryHandler(
            IStoreRepository storeRepository,
            IMapper mapper,
            IHttpContextService httpContextService,
            IStorePaymentRepository storePaymentRepository,
            ISystemConfigurationRepository systemConfigurationRepository,
            IPlanRepository planRepository)
        {
            _storeRepository = storeRepository;
            _mapper = mapper;
            _httpContextService = httpContextService;
            _storePaymentRepository = storePaymentRepository;
            _systemConfigurationRepository = systemConfigurationRepository;
            _planRepository = planRepository;
        }

        public async Task<ResponseResult<IEnumerable<StoreDto>>> Handle(GetStoresByCurrentUserQuery request, CancellationToken cancellationToken)
        {
            var userId = _httpContextService.UserExternalId.ToGuid();
            var stores = _httpContextService.IsSuperAdmin
                ? await _storeRepository.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(excludeStoreId: DataUtils.DefaultStore.Id)
                : _httpContextService.IsReSeller
                    ? await _storeRepository.GetActiveStoresByReSellerUserIdAsync(userId, excludeStoreId: DataUtils.DefaultStore.Id)
                    : await _storeRepository.GetActiveStoresByUserIdAsync(userId, excludeStoreId: DataUtils.DefaultStore.Id);

            // Trial period length is tenant-global: one read up front, shared by every
            // store's nextDueDate calculation below (same shape as GetMyStoresQuery).
            int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();

            // Canonical plan prices are a pure function of the plan catalog — memoized
            // per plan id: one lookup + one summation per DISTINCT plan, not per store.
            var planPriceCache = new Dictionary<int, (float? Price, float? CurrentPrice)>();

            var storeDtos = new List<StoreDto>();
            foreach (var store in stores)
            {
                StoreDto dto = _mapper.Map<StoreDto>(store);

                // Next billing date — the exact canonical calculation of
                // GetStorePlanQuery / GetMyStoresQuery: first due = activation + trial +
                // 1 post-paid month; afterwards the latest paid PaymentBeforeDate; null
                // when the billing clock never started. N+1 on payments per store is
                // accepted and documented (plan R-2): an owner owns a handful of stores.
                var lastPayment = await _storePaymentRepository.GetLastByStoreIdAsync(store.Id);
                DateOnly? lastPaidBeforeDate = lastPayment is null
                    ? null
                    : DateOnly.FromDateTime(lastPayment.PaymentBeforeDate.UtcDateTime);
                // Disapproved stores expose no payment info: the Approved guard wraps the
                // whole computation so a recorded payment or NextDueDateOverride can never
                // resurrect a date for them (same rule as BillingService.cs:60,72,101-102).
                dto.NextPaymentDate = store.Approved
                    ? StoreBillingUtils.GetNextDueDate(
                        store.PaymentStartDate,
                        trialMonths,
                        lastPaidBeforeDate)
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

                storeDtos.Add(dto);
            }

            return ResponseResult.Success((IEnumerable<StoreDto>)storeDtos);
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
