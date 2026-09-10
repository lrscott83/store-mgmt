using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
using Domain.Entities.Roles;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.ChangeStorePlan;

public sealed record ChangeStorePlanCommand(Guid StoreId, int StorePlanId) : ICommand<bool>;

/// <summary>
/// Lets the OWNER of a store (or a SuperAdmin) switch the store's plan to any active plan
/// (including VIP, which stays out of the public catalog). The module set becomes the
/// target plan's universe: catalog priceIncluded modules ∪ plan members — no cherry-picking.
/// Rules:
/// - <see cref="Store.PaymentStartDate"/> (billing anchor) is NEVER touched.
/// - On a paid target with computed nextDueDate &lt;= today, <see cref="Store.NextDueDateOverride"/>
///   is pinned to today (existing grace window covers the payment period).
/// - On the Gratis target, any override is cleared.
/// - Idempotent: switching to the plan the store is already on is a no-op returning true.
/// </summary>
internal sealed class ChangeStorePlanCommandHandler : ICommandHandler<ChangeStorePlanCommand, bool>
{
    private readonly IApplicationUnitOfWork _applicationUnitOfWork;
    private readonly IStoreRepository _storeRepository;
    private readonly IStoreModuleRepository _storeModuleRepository;
    private readonly IModuleRepository _moduleRepository;
    private readonly IFeatureRepository _featureRepository;
    private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
    private readonly IStoreRoleFeatureGenerator _storeRoleFeaturesGenerator;
    private readonly IPlanRepository _planRepository;
    private readonly IStorePaymentRepository _storePaymentRepository;
    private readonly ISystemConfigurationRepository _systemConfigurationRepository;
    private readonly IHttpContextService _httpContextService;
    private readonly IStringLocalizer<I18n> _localizer;
    private readonly IDateTimeProvider _dateTimeProvider;

    public ChangeStorePlanCommandHandler(
        IApplicationUnitOfWork applicationUnitOfWork,
        IStoreRepository storeRepository,
        IStoreModuleRepository storeModuleRepository,
        IModuleRepository moduleRepository,
        IFeatureRepository featureRepository,
        IStoreRoleFeatureRepository storeRoleFeatureRepository,
        IStoreRoleFeatureGenerator storeRoleFeaturesGenerator,
        IPlanRepository planRepository,
        IStorePaymentRepository storePaymentRepository,
        ISystemConfigurationRepository systemConfigurationRepository,
        IHttpContextService httpContextService,
        IStringLocalizer<I18n> localizer,
        IDateTimeProvider dateTimeProvider)
    {
        _applicationUnitOfWork = applicationUnitOfWork;
        _storeRepository = storeRepository;
        _storeModuleRepository = storeModuleRepository;
        _moduleRepository = moduleRepository;
        _featureRepository = featureRepository;
        _storeRoleFeatureRepository = storeRoleFeatureRepository;
        _storeRoleFeaturesGenerator = storeRoleFeaturesGenerator;
        _planRepository = planRepository;
        _storePaymentRepository = storePaymentRepository;
        _systemConfigurationRepository = systemConfigurationRepository;
        _httpContextService = httpContextService;
        _localizer = localizer;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<ResponseResult<bool>> Handle(ChangeStorePlanCommand request, CancellationToken cancellationToken)
    {
        var store = await _storeRepository.GetStoreWithModulesAndReSellerOwnerAsync(request.StoreId);
        if (store is null)
            throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

        // Ownership guard: only the store's owner (or a SuperAdmin) may change its plan.
        if (!_httpContextService.IsSuperAdmin)
        {
            var callerUserId = _httpContextService.UserExternalId.ToGuid();
            if (store.Owner?.User is null || store.Owner.User.Id != callerUserId)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);
        }

        // Preconditions.
        if (!store.IsActive)
            throw new ApiException(_localizer["StoreInactive"], HttpStatusCode.BadRequest);
        if (store.Owner?.User is null || !store.Owner.User.IsActive)
            throw new ApiException(_localizer["OwnerUserInactive"], HttpStatusCode.BadRequest);

        var targetPlan = await _planRepository.GetActivePlanWithModulesByIdAsync(request.StorePlanId);
        if (targetPlan is null)
            throw new ApiException(_localizer["PlanNotFound"], HttpStatusCode.BadRequest);
        if (!targetPlan.IsActive)
            throw new ApiException(_localizer["PlanInactive"], HttpStatusCode.BadRequest);

        // Idempotent no-op: already on the target plan.
        if (store.StorePlanId == targetPlan.Id)
            return ResponseResult.Success(true);

        // Anchor is sacred: PaymentStartDate is never read-modified-written here.
        await ApplyOverrideRule(store, targetPlan);
        store.StorePlanId = targetPlan.Id;
        await ApplyPlanModules(store, targetPlan);

        // NoTracking context: attach the mutated Store or SaveChangesAsync writes nothing.
        await _storeRepository.UpdateAsync(store);
        await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
        return ResponseResult.Success(true);
    }

    /// <summary>
    /// Paid target while overdue → pin the next payment date to today. Gratis target → clear any
    /// pinned override. Future due date → untouched.
    /// </summary>
    private async Task ApplyOverrideRule(Store store, StorePlan targetPlan)
    {
        bool targetIsPaid = targetPlan.Id != (int)StorePlanType.Gratis;
        if (!targetIsPaid)
        {
            store.NextDueDateOverride = null;
            return;
        }

        DateOnly today = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime);
        DateOnly? computedDue = null;
        if (store.PaymentStartDate is not null)
        {
            int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();
            var lastPayment = await _storePaymentRepository.GetLastByStoreIdAsync(store.Id);
            DateOnly? lastPaidBeforeDate = lastPayment is null
                ? null
                : DateOnly.FromDateTime(lastPayment.PaymentBeforeDate.UtcDateTime);
            computedDue = StoreBillingUtils.GetNextDueDate(store.PaymentStartDate, trialMonths, lastPaidBeforeDate,
                store.NextDueDateOverride);
        }

        if (computedDue.HasValue && computedDue.Value <= today)
            store.NextDueDateOverride = today;
    }

    /// <summary>
    /// Makes the store's active module set equal the plan universe: catalog priceIncluded modules
    /// ∪ target plan members. Soft-deletes active modules outside the universe, inserts missing
    /// ones, reactivates soft-deleted ones, and regenerates/reactivates StoreRoleFeatures.
    /// </summary>
    private async Task ApplyPlanModules(Store store, StorePlan targetPlan)
    {
        // Universe: always-included (free) catalog modules + the plan's members.
        IEnumerable<Module> catalog = await _moduleRepository.GetAvailableModulesToStore();
        var freeModuleIds = catalog.Where(m => m.PriceIncluded).Select(m => m.Id).ToList();
        var planModuleIds = targetPlan.StorePlanModules.Select(spm => spm.ModuleId).ToList();
        var universe = freeModuleIds.Union(planModuleIds).Distinct().ToList();

        var modulesById = (await _moduleRepository.GetModulesByIdsAsync(universe)).ToDictionary(m => m.Id);
        IEnumerable<StoreModule> existing = await _storeModuleRepository.GetStoreModulesByIdAsync(store.Id);

        var insertedModuleIds = new List<int>();
        var updatedModuleIds = new List<int>();

        // Soft-delete active modules outside the universe.
        var toDelete = existing.Where(sm => sm.IsActive && !universe.Contains(sm.ModuleId)).ToList();
        foreach (var item in toDelete)
        {
            item.IsActive = false;
            await _storeModuleRepository.UpdateAsync(item);
        }
        if (toDelete.Count > 0)
        {
            IEnumerable<StoreRoleFeature> featuresToDeactivate = await _storeRoleFeatureRepository
                .GetAllActiveToStoreByStoreIdAndModuleIdsAsync(store.Id, toDelete.Select(sm => sm.ModuleId).ToList());
            foreach (var srf in featuresToDeactivate)
            {
                srf.IsActive = false;
                await _storeRoleFeatureRepository.UpdateAsync(srf);
            }
        }

        // Insert missing / reactivate soft-deleted.
        foreach (var moduleId in universe)
        {
            Module module = modulesById[moduleId];
            StoreModule? storeModule = existing.FirstOrDefault(sm => sm.ModuleId == moduleId);
            if (storeModule is null)
            {
                storeModule = StoreModule.Create(store.Id, moduleId, module.Price, module.PriceIncluded,
                    module.Price, module.DiscountPrice, module.PercentDiscountPrice, store.TenantId);
                await _storeModuleRepository.AddAsync(storeModule);
                insertedModuleIds.Add(moduleId);
            }
            else if (!storeModule.IsActive)
            {
                storeModule.IsActive = true;
                storeModule.Price = module.Price;
                storeModule.ModulePriceIncluded = module.PriceIncluded;
                storeModule.ModulePrice = module.Price;
                storeModule.ModulePercentDiscountPrice = module.PercentDiscountPrice;
                storeModule.ModuleDiscountPrice = module.DiscountPrice;
                await _storeModuleRepository.UpdateAsync(storeModule);
                updatedModuleIds.Add(moduleId);
            }
        }

        // StoreRoleFeatures: generate for inserted, reactivate for reactivated modules.
        if (insertedModuleIds.Count > 0)
        {
            List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync(insertedModuleIds);
            var storeRoleFeatures = await _storeRoleFeaturesGenerator.GenerateStoreRoleFeaturesAsync(store.Id, store.TenantId, featureIds);
            foreach (var srf in storeRoleFeatures)
                await _storeRoleFeatureRepository.AddAsync(srf);
        }

        foreach (var moduleId in updatedModuleIds)
        {
            List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync([moduleId]);
            IEnumerable<StoreRoleFeature> existingFeatures = await _storeRoleFeatureRepository
                .GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(store.Id, moduleId, featureIds);
            foreach (var featureId in featureIds)
            {
                StoreRoleFeature? srf = existingFeatures.FirstOrDefault(f => f.FeatureId == featureId);
                if (srf is null)
                {
                    await _storeRoleFeatureRepository.AddAsync(
                        StoreRoleFeature.Create(store.Id, (int)RoleType.StoreUser, featureId, store.TenantId));
                }
                else
                {
                    srf.IsActive = true;
                    await _storeRoleFeatureRepository.UpdateAsync(srf);
                }
            }
        }
    }
}
