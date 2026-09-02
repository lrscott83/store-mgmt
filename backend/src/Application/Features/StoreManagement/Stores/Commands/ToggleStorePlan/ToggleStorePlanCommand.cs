using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Modules;
using Domain.Entities.Roles;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.ToggleStorePlan;

public sealed record ToggleStorePlanCommand(Guid StoreId) : ICommand<bool>;

/// <summary>
/// Atomic Free &lt;-&gt; Paid plan toggle. Validates preconditions (store active, owner user
/// active, ReSeller ownership), computes the target plan from <see cref="Store.PaymentStartDate"/>
/// and applies the module/date mutations in a single <see cref="IApplicationUnitOfWork.SaveChangesAsync"/>
/// transaction. Idempotent: toggling on the already-current plan is a no-op returning <c>true</c>.
/// </summary>
internal sealed class ToggleStorePlanCommandHandler : ICommandHandler<ToggleStorePlanCommand, bool>
{
    private readonly IApplicationUnitOfWork _applicationUnitOfWork;
    private readonly IStoreRepository _storeRepository;
    private readonly IStoreModuleRepository _storeModuleRepository;
    private readonly IModuleRepository _moduleRepository;
    private readonly IFeatureRepository _featureRepository;
    private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
    private readonly IStoreRoleFeatureGenerator _storeRoleFeaturesGenerator;
    private readonly IHttpContextService _httpContextService;
    private readonly IStringLocalizer<I18n> _localizer;
    private readonly IDateTimeProvider _dateTimeProvider;

    public ToggleStorePlanCommandHandler(
        IApplicationUnitOfWork applicationUnitOfWork,
        IStoreRepository storeRepository,
        IStoreModuleRepository storeModuleRepository,
        IModuleRepository moduleRepository,
        IFeatureRepository featureRepository,
        IStoreRoleFeatureRepository storeRoleFeatureRepository,
        IStoreRoleFeatureGenerator storeRoleFeaturesGenerator,
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
        _httpContextService = httpContextService;
        _localizer = localizer;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<ResponseResult<bool>> Handle(ToggleStorePlanCommand request, CancellationToken cancellationToken)
    {
        // Role guard: only SuperAdmin or ReSeller can toggle a plan (mirrors RegisterStorePaymentCommand).
        bool isSuperAdmin = _httpContextService.IsSuperAdmin;
        bool isReSeller = _httpContextService.IsReSeller;
        if (!isSuperAdmin && !isReSeller)
            throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

        // Load store with modules + reseller ownership (Owner.User loaded for the IsActive precondition).
        var store = await _storeRepository.GetStoreWithModulesAndReSellerOwnerAsync(request.StoreId);
        if (store is null)
            throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

        // Preconditions.
        if (!store.IsActive)
            throw new ApiException(_localizer["StoreInactive"], HttpStatusCode.BadRequest);

        if (store.Owner?.User is null || !store.Owner.User.IsActive)
            throw new ApiException(_localizer["OwnerUserInactive"], HttpStatusCode.BadRequest);

        // If not SuperAdmin, verify the ReSeller owns this store.
        if (!isSuperAdmin)
        {
            var reSellerUserId = _httpContextService.UserExternalId.ToGuid();
            bool ownsStore = await _storeRepository.IsStoreOwnedByReSellerUserAsync(request.StoreId, reSellerUserId);
            if (!ownsStore)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);
        }

        // Determine target plan from PaymentStartDate: null => Free, set => Paid.
        // Toggling to the same plan the store already is on is a no-op.
        bool isPaid = store.PaymentStartDate is not null;
        bool targetPaid = !isPaid;

        if (targetPaid)
            await ApplyFreeToPaid(store);
        else
            await ApplyPaidToFree(store);

        // The context is NoTracking by default: the mutated Store must be attached
        // explicitly or SaveChangesAsync would write nothing (CLAUDE.md gotcha).
        await _storeRepository.UpdateAsync(store);
        await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
        return ResponseResult.Success(true);
    }

    /// <summary>
    /// Free -&gt; Paid: set PaymentStartDate to today, activate ALL paid modules
    /// (PriceIncluded=false), and generate/activate their StoreRoleFeatures.
    /// </summary>
    private async Task ApplyFreeToPaid(Store store)
    {
        store.PaymentStartDate = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime);

        IEnumerable<StoreModule> existingModules = await _storeModuleRepository.GetStoreModulesByIdAsync(store.Id);
        IEnumerable<Module> paidModules = (await _moduleRepository.GetAvailableModulesToStore())
            .Where(m => !m.PriceIncluded)
            .ToList();

        List<int> insertedModuleIds = new();
        List<int> activatedModuleIds = new();

        foreach (var paidModule in paidModules)
        {
            StoreModule? storeModule = existingModules.FirstOrDefault(sm => sm.ModuleId == paidModule.Id);
            if (storeModule is null)
            {
                var newModule = StoreModule.Create(store.Id, paidModule.Id, paidModule.Price, paidModule.PriceIncluded,
                    paidModule.Price, paidModule.DiscountPrice, paidModule.PercentDiscountPrice, store.TenantId);
                await _storeModuleRepository.AddAsync(newModule);
                insertedModuleIds.Add(paidModule.Id);
            }
            else if (!storeModule.IsActive)
            {
                storeModule.IsActive = true;
                storeModule.Price = paidModule.Price;
                storeModule.ModulePriceIncluded = paidModule.PriceIncluded;
                storeModule.ModulePrice = paidModule.Price;
                storeModule.ModulePercentDiscountPrice = paidModule.PercentDiscountPrice;
                storeModule.ModuleDiscountPrice = paidModule.DiscountPrice;
                await _storeModuleRepository.UpdateAsync(storeModule);
                activatedModuleIds.Add(paidModule.Id);
            }
        }

        // Generate StoreRoleFeatures for newly inserted modules, reactivate for re-activated ones.
        if (insertedModuleIds.Count > 0)
        {
            List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync(insertedModuleIds);
            var storeRoleFeatures = await _storeRoleFeaturesGenerator.GenerateStoreRoleFeaturesAsync(store.Id, store.TenantId, featureIds);
            foreach (var srf in storeRoleFeatures)
                await _storeRoleFeatureRepository.AddAsync(srf);
        }

        foreach (var moduleId in activatedModuleIds)
        {
            List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync([moduleId]);
            await ReactivateFeaturesForModule(store, moduleId, featureIds);
        }
    }

    /// <summary>
    /// Paid -&gt; Free: set PaymentStartDate to null, soft-delete ALL paid StoreModules
    /// (IsActive=false), deactivate their StoreRoleFeatures. Free modules untouched.
    /// </summary>
    private async Task ApplyPaidToFree(Store store)
    {
        store.PaymentStartDate = null;

        var paidModules = store.StoreModules.Where(sm => sm.IsActive && !sm.ModulePriceIncluded).ToList();
        if (paidModules.Count == 0)
            return;

        foreach (var module in paidModules)
        {
            module.IsActive = false;
            await _storeModuleRepository.UpdateAsync(module);
        }

        var paidModuleIds = paidModules.Select(sm => sm.ModuleId).ToList();
        var storeRoleFeaturesToDeactivate = await _storeRoleFeatureRepository
            .GetAllActiveToStoreByStoreIdAndModuleIdsAsync(store.Id, paidModuleIds);
        foreach (var srf in storeRoleFeaturesToDeactivate)
        {
            srf.IsActive = false;
            await _storeRoleFeatureRepository.UpdateAsync(srf);
        }
    }

    private async Task ReactivateFeaturesForModule(Store store, int moduleId, List<int> featureIds)
    {
        var existing = await _storeRoleFeatureRepository.GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(store.Id, moduleId, featureIds);
        foreach (var featureId in featureIds)
        {
            StoreRoleFeature? srf = existing.FirstOrDefault(f => f.FeatureId == featureId);
            if (srf is null)
            {
                var newSrf = StoreRoleFeature.Create(store.Id, (int)RoleType.StoreUser, featureId, store.TenantId);
                await _storeRoleFeatureRepository.AddAsync(newSrf);
            }
            else
            {
                srf.IsActive = true;
                await _storeRoleFeatureRepository.UpdateAsync(srf);
            }
        }
    }
}
