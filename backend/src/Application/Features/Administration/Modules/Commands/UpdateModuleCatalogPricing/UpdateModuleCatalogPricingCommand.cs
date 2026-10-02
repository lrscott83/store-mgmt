using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Modules;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Utils;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Modules.Commands.UpdateModuleCatalogPricing
{
    /// <summary>
    /// One row of the catalog pricing save: a module id and the three editable
    /// GLOBAL catalog price fields.
    /// </summary>
    public sealed record ModuleCatalogPricingRequest(
        int ModuleId,
        float Price,
        float DiscountPrice,
        float PercentDiscountPrice);

    /// <summary>
    /// SuperAdmin authors the GLOBAL module catalog prices: base price, flat discount and
    /// percent discount, for every module in one save.
    /// <para>
    /// This edits the <c>Module</c> catalog itself — the prices seed migrations and the
    /// SuperAdmin catalog page are built on. It is NOT the per-store capability
    /// (<c>PUT /v1/stores/{storeId}/module-pricing</c>), which writes frozen copies on
    /// <c>StoreModule</c> rows and never reads the catalog as a store's price. The two are
    /// deliberately separate so editing the catalog can never silently reprice a store.
    /// </para>
    /// <para>
    /// SCOPE — exactly three fields move: <c>Price</c>, <c>DiscountPrice</c> and
    /// <c>PercentDiscountPrice</c>. The catalog's structural flags — <c>IsActive</c>,
    /// <c>AvailableToStore</c>, <c>PriceIncluded</c>, <c>Name</c>, <c>Order</c> — are read
    /// and written back unchanged, so a pricing save can never publish, hide, re-bundle or
    /// rename a module. Those flags have their own endpoints.
    /// </para>
    /// <para>
    /// FAIL-CLOSED — existence is decided for the WHOLE payload before a single row is
    /// written, so an unknown module id aborts the save rather than leaving the operator
    /// with a half-applied table and a success message.
    /// </para>
    /// </summary>
    public sealed record UpdateModuleCatalogPricingCommand(
        List<ModuleCatalogPricingRequest>? Modules) : ICommand<ModuleCatalogPricingResultDto>;

    internal sealed class UpdateModuleCatalogPricingCommandHandler
        : ICommandHandler<UpdateModuleCatalogPricingCommand, ModuleCatalogPricingResultDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IModuleRepository _moduleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateModuleCatalogPricingCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IModuleRepository moduleRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _moduleRepository = moduleRepository;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<ModuleCatalogPricingResultDto>> Handle(
            UpdateModuleCatalogPricingCommand request, CancellationToken cancellationToken)
        {
            // SuperAdmin only. The action's [HasPermission(StoreRoleFeatures.SuperAdmin)]
            // already refuses anyone else, but the check is repeated here for the same
            // reason UpdateStoreModulePricing repeats it: the capability stays closed if the
            // route is ever re-exposed without its attribute.
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            // Validated non-empty; the null guard only keeps the handler total if it is
            // ever invoked outside the MediatR pipeline.
            var rows = request.Modules ?? [];
            var payloadModuleIds = rows.Select(r => r.ModuleId).ToHashSet();

            // One catalog read serves both jobs: existence, and the unchanged structural
            // fields that the re-attached entity writes back. Untracked — each row is
            // re-attached below through UpdateAsync before the single SaveChangesAsync.
            var catalog = (await _moduleRepository.GetModulesByIdsAsync(payloadModuleIds)).ToDictionary(m => m.Id);
            foreach (var moduleId in payloadModuleIds)
            {
                if (!catalog.ContainsKey(moduleId))
                    throw new ApiException(_localizer["ModuleNotFound"], HttpStatusCode.BadRequest);
            }

            foreach (var row in rows)
            {
                var module = catalog[row.ModuleId];

                // The only three fields this endpoint owns.
                module.Price = row.Price;
                module.DiscountPrice = row.DiscountPrice;
                module.PercentDiscountPrice = row.PercentDiscountPrice;

                // NoTracking-safe: ApplicationDbContext sets QueryTrackingBehavior.NoTracking
                // globally, so the entity read above is detached and a bare SaveChangesAsync
                // would write NOTHING — no exception, no warning. UpdateAsync sets
                // Entry.State = Modified, re-attaching it so the write lands. The columns
                // this does not own are rewritten with the values just read, so the UPDATE
                // is a no-op for them.
                await _moduleRepository.UpdateAsync(module);
            }

            // UnitOfWorkBehaviour.IsQuery() always returns true, so this explicit call is
            // the ONLY thing that persists the work.
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            var saved = new List<ModuleCatalogPricingDto>(rows.Count);
            // THE price rule (ModulePriceCalculator) over the catalog rows this save just
            // wrote — the entities in `catalog` already carry the new prices, and
            // CalculateTotal drops the ones that are inactive or price-included. Previously
            // every payload row was summed, included and gratis ones alike.
            float totalCurrentPrice = ModulePriceCalculator.CalculateTotal(
                rows.Select(row => catalog[row.ModuleId]));
            foreach (var row in rows)
            {
                // The one formula. Reused, never reimplemented: percent before flat
                // discount, no rounding, clamped at zero. Reported for EVERY row, billable
                // or not.
                float currentPrice = CurrentPriceServiceUtils.GetCurrentPrice(
                    row.Price, row.PercentDiscountPrice, row.DiscountPrice);

                saved.Add(new ModuleCatalogPricingDto
                {
                    ModuleId = row.ModuleId,
                    Name = catalog[row.ModuleId].Name,
                    Price = row.Price,
                    DiscountPrice = row.DiscountPrice,
                    PercentDiscountPrice = row.PercentDiscountPrice,
                    PriceIncluded = catalog[row.ModuleId].PriceIncluded,
                    IsActive = catalog[row.ModuleId].IsActive,
                    CurrentPrice = currentPrice
                });
            }

            return ResponseResult.Success(new ModuleCatalogPricingResultDto
            {
                Modules = saved,
                TotalCurrentPrice = totalCurrentPrice
            });
        }
    }
}
