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
    /// store cards show plan + price + next payment date, and the DTO is shared by
    /// every role's listing.
    /// </summary>
    public class GetStoresByCurrentUserQueryHandler : IQueryHandler<GetStoresByCurrentUserQuery, IEnumerable<StoreDto>>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IMapper _mapper;
        private readonly IHttpContextService _httpContextService;
        private readonly IStorePaymentRepository _storePaymentRepository;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;

        public GetStoresByCurrentUserQueryHandler(
            IStoreRepository storeRepository,
            IMapper mapper,
            IHttpContextService httpContextService,
            IStorePaymentRepository storePaymentRepository,
            ISystemConfigurationRepository systemConfigurationRepository)
        {
            _storeRepository = storeRepository;
            _mapper = mapper;
            _httpContextService = httpContextService;
            _storePaymentRepository = storePaymentRepository;
            _systemConfigurationRepository = systemConfigurationRepository;
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
                dto.NextPaymentDate = StoreBillingUtils.GetNextDueDate(
                    store.PaymentStartDate,
                    trialMonths,
                    lastPaidBeforeDate);

                storeDtos.Add(dto);
            }

            return ResponseResult.Success((IEnumerable<StoreDto>)storeDtos);
        }
    }
}
