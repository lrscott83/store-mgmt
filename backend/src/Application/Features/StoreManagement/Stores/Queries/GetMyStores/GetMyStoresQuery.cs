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
    /// inactive — with the calculated next billing date and the store's BILLING price:
    /// the sum over the modules the store actually has assigned and that are ACTIVE
    /// (ModulePriceCalculator — the exact rule BillingService and the to-collect
    /// listing charge), NOT the plan catalog's total. Mirrors
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
        private readonly IStringLocalizer<I18n> _localizer;

        public GetMyStoresQueryHandler(
            IStoreRepository storeRepository,
            IMapper mapper,
            IHttpContextService httpContextService,
            IStorePaymentRepository storePaymentRepository,
            ISystemConfigurationRepository systemConfigurationRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _mapper = mapper;
            _httpContextService = httpContextService;
            _storePaymentRepository = storePaymentRepository;
            _systemConfigurationRepository = systemConfigurationRepository;
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

                // Card price = THE billing formula over the store's OWN snapshot
                // (ModulePriceCalculator: active and not price-included rows only), so
                // the number the card shows is the number the store is charged — never
                // the plan catalog's total, which a store with a different module set
                // would overstate. Disapproved stores expose no price — the same
                // Approved guard as the payment date above.
                if (store.Approved)
                {
                    dto.PlanPrice = ModulePriceCalculator.CalculateBaseTotal(store.StoreModules);
                    dto.PlanCurrentPrice = ModulePriceCalculator.CalculateTotal(store.StoreModules);
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
    }
}
