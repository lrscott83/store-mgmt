using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Queries.GetStoreModulePricing
{
    public sealed record GetStoreModulePricingQuery(Guid StoreId)
        : IQuery<StoreModulePricingReadResultDto> { }

    /// <summary>
    /// The seed for the per-store module pricing editor: one row per module the operator may
    /// price, already carrying the store's own state.
    ///
    /// WHY A DEDICATED READ instead of composing GET /v1/stores/{id} with GET /v1/modules/ToStore:
    /// the store's nested <c>modules[]</c> is not a usable source of editable values. The
    /// <c>StoreModule -&gt; ModuleDto</c> AutoMapper map
    /// (<c>Application/Mappings/Administration/ModuleProfile.cs:20-31</c>) has no rule for
    /// <c>ModuleDiscountPrice -&gt; DiscountPrice</c> or
    /// <c>ModulePercentDiscountPrice -&gt; PercentDiscountPrice</c>, so those two serialize as
    /// 0 for every store module while <c>currentPrice</c> IS computed from the real values. That
    /// gap is a pre-existing read bug and is deliberately NOT fixed here — fixing it would change
    /// existing read responses, which is out of scope for this additive capability. Reading the
    /// real values requires a projection that maps the two explicitly, which is what this query
    /// is.
    /// </summary>
    public class GetStoreModulePricingQueryHandler
        : IQueryHandler<GetStoreModulePricingQuery, StoreModulePricingReadResultDto>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IModuleRepository _moduleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreModulePricingQueryHandler(
            IGetStoreByIdService storeByIdService,
            IStoreModuleRepository storeModuleRepository,
            IModuleRepository moduleRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _storeByIdService = storeByIdService;
            _storeModuleRepository = storeModuleRepository;
            _moduleRepository = moduleRepository;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreModulePricingReadResultDto>> Handle(
            GetStoreModulePricingQuery query, CancellationToken cancellationToken)
        {
            // SuperAdmin only, matching the write (UpdateStoreModulePricingCommandHandler:113)
            // so the two halves of the same capability can never disagree about who may use it.
            // IsSuperAdminOrOwnerAdmin would let an OwnerAdmin read an arbitrary store's pricing.
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(query.StoreId);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            // The EXACT universe the operator is shown, from the SAME repository call behind
            // GET /v1/modules/ToStore (IsActive && AvailableToStore, ordered by PriceIncluded
            // then Order). Reusing it guarantees the read can never list a module the save
            // would reject, and guarantees the save payload — the whole list, ticked or not —
            // is the whole universe.
            IEnumerable<Module> catalog = await _moduleRepository.GetAvailableModulesToStore();

            // Every row the store holds, ACTIVE AND INACTIVE. The inactive ones matter: their
            // stored prices are what the operator must see, because ticking the row back on
            // writes exactly what is displayed. Reading active rows only would silently replace
            // a store's own prices with catalog ones.
            IEnumerable<StoreModule> existing = await _storeModuleRepository.GetStoreModulesByIdAsync(query.StoreId);
            var existingByModuleId = existing.ToDictionary(storeModule => storeModule.ModuleId);

            var rows = new List<StoreModulePricingReadDto>();
            double totalCurrentPrice = 0d;

            foreach (var module in catalog)
            {
                StoreModule? storeModule = existingByModuleId.GetValueOrDefault(module.Id);

                bool isActive = storeModule?.IsActive ?? false;
                // Store's own value when a row exists (whatever its IsActive); the live catalog
                // price as the seed when it does not, so an unticked row shows what ticking it
                // would cost rather than a column of zeros.
                float price = storeModule?.Price ?? module.Price;
                float discountPrice = storeModule?.ModuleDiscountPrice ?? module.DiscountPrice;
                float percentDiscountPrice = storeModule?.ModulePercentDiscountPrice ?? module.PercentDiscountPrice;

                // The one formula — reused, never reimplemented. Computed for EVERY row so an
                // unticked row still reports what it would cost; summed for active rows only.
                float currentPrice = CurrentPriceServiceUtils.GetCurrentPrice(
                    price, percentDiscountPrice, discountPrice);

                if (isActive)
                    totalCurrentPrice += currentPrice;

                rows.Add(new StoreModulePricingReadDto
                {
                    ModuleId = module.Id,
                    Name = module.Name,
                    IsActive = isActive,
                    Price = price,
                    DiscountPrice = discountPrice,
                    PercentDiscountPrice = percentDiscountPrice,
                    CurrentPrice = currentPrice
                });
            }

            return ResponseResult.Success(new StoreModulePricingReadResultDto
            {
                StoreId = query.StoreId,
                Modules = rows,
                TotalCurrentPrice = totalCurrentPrice
            });
        }
    }
}
