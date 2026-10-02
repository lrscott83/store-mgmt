using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.Roles;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Domain.Interfaces.Services.Tenants;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStoreModulePricing
{
    /// <summary>
    /// One row of the pricing save: the tick plus the three editable price fields.
    /// </summary>
    public sealed record StoreModulePricingRequest(
        int ModuleId,
        bool IsSelected,
        float Price,
        float DiscountPrice,
        float PercentDiscountPrice);

    /// <summary>
    /// <c>Modules</c> is the COMPLETE set the operator was shown — every active,
    /// <c>AvailableToStore</c> module — not just the ticked ones. That completeness is
    /// what makes "unticked" actionable: a module the operator unticked was in front of
    /// them, so unticking it means deactivate.
    /// </summary>
    public sealed record UpdateStoreModulePricingCommand(
        Guid StoreId,
        List<StoreModulePricingRequest>? Modules) : ICommand<StoreModulePricingResultDto>;

    /// <summary>
    /// SuperAdmin authors ONE store's own module prices: tick/untick every available
    /// module and set its price, discount and percent discount, in a single save.
    ///
    /// Why a dedicated endpoint instead of <c>PUT /v1/stores/{id}</c>: the general
    /// update REPLACES the whole module set AND, on reactivate, overwrites prices from
    /// the global <c>Module</c> catalog — so a store's own price can never be authored
    /// and any custom price is clobbered the next time the set is rewritten. This path
    /// never reads catalog prices as the store's price; the catalog is consulted only for
    /// existence and for the <c>PriceIncluded</c> activation snapshot.
    ///
    /// Per row, exactly one of:
    /// - ticked  + no row        → INSERT
    /// - ticked  + row inactive  → REACTIVATE + write the three prices
    /// - ticked  + row active    → write the three prices
    /// - unticked + row active   → DEACTIVATE (soft flag; the row is NEVER removed)
    /// - unticked + no/inactive  → no write at all (nothing to deactivate, and a row is
    ///                             never created just to be left inactive)
    ///
    /// PAYLOAD-UNIVERSE RULE — the deliberate design decision: a module ABSENT from the
    /// payload is left completely untouched. The payload mirrors the catalog the operator
    /// was shown, and that catalog can have moved on: a store may already hold a module
    /// that is no longer active/AvailableToStore, so it never appears in the list. Read
    /// as a whole-set replacement, the save would silently deactivate a module nobody
    /// was shown and could not have ticked — and the operator would have no way to put it
    /// back. Absence is read as "not part of this edit", never as "deactivate". The
    /// plan-driven whole-set rewrite remains the path that owns a store's full universe.
    ///
    /// Soft delete only: a <c>StoreModule</c> row is never deleted, so history and any
    /// frozen <c>ModulePriceIncluded</c> snapshot survive.
    /// </summary>
    internal sealed class UpdateStoreModulePricingCommandHandler
        : ICommandHandler<UpdateStoreModulePricingCommand, StoreModulePricingResultDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IModuleRepository _moduleRepository;
        private readonly IFeatureRepository _featureRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IStoreRoleFeatureGenerator _storeRoleFeaturesGenerator;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateStoreModulePricingCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IGetStoreByIdService storeByIdService,
            IStoreModuleRepository storeModuleRepository,
            IModuleRepository moduleRepository,
            IFeatureRepository featureRepository,
            IStoreRoleFeatureRepository storeRoleFeatureRepository,
            IStoreRoleFeatureGenerator storeRoleFeaturesGenerator,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _storeByIdService = storeByIdService;
            _storeModuleRepository = storeModuleRepository;
            _moduleRepository = moduleRepository;
            _featureRepository = featureRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _storeRoleFeaturesGenerator = storeRoleFeaturesGenerator;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreModulePricingResultDto>> Handle(
            UpdateStoreModulePricingCommand request, CancellationToken cancellationToken)
        {
            // SuperAdmin only. IsSuperAdminOrOwnerAdmin would let an OwnerAdmin price its
            // own store, which this capability was never scoped for.
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.StoreId);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            // Validated non-empty; the null guard only keeps the handler total if it is
            // ever invoked outside the MediatR pipeline.
            var rows = request.Modules ?? [];
            var payloadModuleIds = rows.Select(r => r.ModuleId).ToHashSet();

            // Catalog read for EXISTENCE and for the PriceIncluded activation snapshot
            // only — never as the store's price. Fail closed on an unknown id rather
            // than skipping the row, so a stale client can never half-apply a save.
            var catalog = (await _moduleRepository.GetModulesByIdsAsync(payloadModuleIds)).ToDictionary(m => m.Id);
            foreach (var moduleId in payloadModuleIds)
            {
                if (!catalog.ContainsKey(moduleId))
                    throw new ApiException(_localizer["ModuleNotFound"], HttpStatusCode.BadRequest);
            }

            // EVERY row the store holds, active and inactive — reactivation needs the
            // inactive ones. Untracked: each mutation is re-attached below through
            // AddAsync/UpdateAsync before the single SaveChangesAsync.
            IEnumerable<StoreModule> existing = await _storeModuleRepository.GetStoreModulesByIdAsync(request.StoreId);

            var insertedModuleIds = new List<int>();
            var reactivatedModuleIds = new List<int>();
            var deactivatedModuleIds = new List<int>();

            // The price-included flag AS PERSISTED for each payload row, captured while the
            // rows are being written: insert and reactivate freeze it from the catalog, and an
            // already-active row keeps its own frozen value. The payload carries no such flag,
            // so the echo's total cannot be computed without this.
            var persistedPriceIncluded = new Dictionary<int, bool>();

            foreach (var row in rows)
            {
                StoreModule? storeModule = existing.FirstOrDefault(sm => sm.ModuleId == row.ModuleId);

                if (row.IsSelected)
                {
                    if (storeModule is null)
                    {
                        // INSERT. ModulePriceIncluded is frozen from the catalog at
                        // activation and ModulePrice mirrors Price — the exact shape of
                        // the existing insert (UpdateStoreCommand.cs:192-193).
                        storeModule = StoreModule.Create(request.StoreId, row.ModuleId, row.Price,
                            catalog[row.ModuleId].PriceIncluded, row.Price, row.DiscountPrice,
                            row.PercentDiscountPrice, store.TenantId);
                        await _storeModuleRepository.AddAsync(storeModule);
                        insertedModuleIds.Add(row.ModuleId);
                        persistedPriceIncluded[row.ModuleId] = storeModule.ModulePriceIncluded;
                    }
                    else
                    {
                        if (!storeModule.IsActive)
                        {
                            // REACTIVATE. ModulePriceIncluded is re-frozen from the
                            // catalog on every activation (UpdateStoreCommand.cs:202) —
                            // keeping that invariant here is what preserves the
                            // BillingService exclusion of included modules.
                            storeModule.IsActive = true;
                            storeModule.ModulePriceIncluded = catalog[row.ModuleId].PriceIncluded;
                            reactivatedModuleIds.Add(row.ModuleId);
                        }

                        // The three editable fields are written for EVERY ticked module,
                        // already-active or just reactivated — that is the whole point
                        // of this endpoint. ModulePrice is a DEAD column (written at
                        // insert, read nowhere); it mirrors Price to stay consistent
                        // with the insert shape instead of inventing a value.
                        storeModule.Price = row.Price;
                        storeModule.ModulePrice = row.Price;
                        storeModule.ModuleDiscountPrice = row.DiscountPrice;
                        storeModule.ModulePercentDiscountPrice = row.PercentDiscountPrice;

                        // NoTracking-safe: UpdateAsync sets Entry.State = Modified,
                        // which re-attaches this untracked entity so the write lands.
                        await _storeModuleRepository.UpdateAsync(storeModule);

                        persistedPriceIncluded[row.ModuleId] = storeModule.ModulePriceIncluded;
                    }
                }
                else if (storeModule is not null && storeModule.IsActive)
                {
                    // DEACTIVATE — a soft flag only, never a delete.
                    storeModule.IsActive = false;
                    await _storeModuleRepository.UpdateAsync(storeModule);
                    deactivatedModuleIds.Add(row.ModuleId);
                    persistedPriceIncluded[row.ModuleId] = storeModule.ModulePriceIncluded;
                }

                // Unticked with no row, or unticked and already inactive: no write. A
                // StoreModule row is never created just to sit inactive.
            }

            // ---- StoreRoleFeature sync -------------------------------------------------
            // Mirrors UpdateStoreCommand.UpdateStoreModules (UpdateStoreCommand.cs:173-179
            // for deactivation, 212-220 for inserts, 222-245 for reactivation). /me
            // FeatureIds is resolved from these rows, so activating or deactivating a
            // module without syncing them would make the roster disagree with the
            // store's active module set.

            if (deactivatedModuleIds.Count > 0)
            {
                IEnumerable<StoreRoleFeature> featuresToDeactivate = await _storeRoleFeatureRepository
                    .GetAllActiveToStoreByStoreIdAndModuleIdsAsync(request.StoreId, deactivatedModuleIds);
                foreach (var storeRoleFeature in featuresToDeactivate)
                {
                    storeRoleFeature.IsActive = false;
                    await _storeRoleFeatureRepository.UpdateAsync(storeRoleFeature);
                }
            }

            if (insertedModuleIds.Count > 0)
            {
                List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync(insertedModuleIds);
                var storeRoleFeatures = await _storeRoleFeaturesGenerator
                    .GenerateStoreRoleFeaturesAsync(request.StoreId, store.TenantId, featureIds);
                foreach (var storeRoleFeature in storeRoleFeatures)
                {
                    await _storeRoleFeatureRepository.AddAsync(storeRoleFeature);
                }
            }

            foreach (var reactivatedModuleId in reactivatedModuleIds)
            {
                List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync([reactivatedModuleId]);
                IEnumerable<StoreRoleFeature> storeRoleFeaturesToUpdate = await _storeRoleFeatureRepository
                    .GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(request.StoreId, reactivatedModuleId, featureIds);

                foreach (var featureId in featureIds)
                {
                    StoreRoleFeature? storeRoleFeature = storeRoleFeaturesToUpdate.FirstOrDefault(srf => srf.FeatureId == featureId);
                    if (storeRoleFeature is null)
                    {
                        await _storeRoleFeatureRepository.AddAsync(
                            StoreRoleFeature.Create(request.StoreId, (int)RoleType.StoreUser, featureId, store.TenantId));
                    }
                    else
                    {
                        storeRoleFeature.IsActive = true;
                        await _storeRoleFeatureRepository.UpdateAsync(storeRoleFeature);
                    }
                }
            }

            // Single save: every insert/reactivate/deactivate and every role-feature row
            // lands together. UnitOfWorkBehaviour.IsQuery() always returns true, so this
            // explicit call is the ONLY thing that persists the work.
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            var saved = new List<StoreModulePricingDto>(rows.Count);
            double totalCurrentPrice = 0d;
            foreach (var row in rows)
            {
                // The store's own frozen flag for this row; a row the save created no snapshot
                // for falls back to the catalog, which is what activating it would freeze.
                bool priceIncluded = persistedPriceIncluded.TryGetValue(row.ModuleId, out bool persisted)
                    ? persisted
                    : catalog[row.ModuleId].PriceIncluded;

                // The one formula. Reused, never reimplemented: percent before flat
                // discount, no rounding, clamped at zero.
                float currentPrice = CurrentPriceServiceUtils.GetCurrentPrice(
                    row.Price, row.PercentDiscountPrice, row.DiscountPrice);

                // THE price rule (ModulePriceCalculator.IsBillable = ticked AND not
                // price-included) — the same rows RegisterStorePaymentCommand charges.
                if (ModulePriceCalculator.IsBillable(row.IsSelected, priceIncluded))
                    totalCurrentPrice += currentPrice;

                saved.Add(new StoreModulePricingDto
                {
                    ModuleId = row.ModuleId,
                    IsActive = row.IsSelected,
                    Price = row.Price,
                    DiscountPrice = row.DiscountPrice,
                    PercentDiscountPrice = row.PercentDiscountPrice,
                    PriceIncluded = priceIncluded,
                    CurrentPrice = currentPrice
                });
            }

            return ResponseResult.Success(new StoreModulePricingResultDto
            {
                StoreId = request.StoreId,
                Modules = saved,
                TotalCurrentPrice = totalCurrentPrice
            });
        }
    }
}
