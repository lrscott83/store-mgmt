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
/// active, ReSeller ownership), derives the direction from <see cref="Store.StorePlanId"/>
/// (never from <see cref="Store.PaymentStartDate"/> — every store's clock starts at creation),
/// and applies the module mutations in a single
/// <see cref="IApplicationUnitOfWork.SaveChangesAsync"/> transaction.
/// owner-plan-change alignment:
/// - The billing anchor (PaymentStartDate) is NEVER written — kept, never nulled.
/// - <see cref="Store.StorePlanId"/> is written (Gratis ⇄ Pago), keeping planType in sync.
/// - Override rule: Free→Paid while overdue pins <see cref="Store.NextDueDateOverride"/> to
///   today; Paid→Free clears it.
/// Module bookkeeping is idempotent: nothing to insert when every paid module is already
/// active, nothing to soft-delete when none are.
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
    private readonly ISystemConfigurationRepository _systemConfigurationRepository;
    private readonly IStorePaymentRepository _storePaymentRepository;
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
        ISystemConfigurationRepository systemConfigurationRepository,
        IStorePaymentRepository storePaymentRepository,
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
        _systemConfigurationRepository = systemConfigurationRepository;
        _storePaymentRepository = storePaymentRepository;
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

        // Direction derives from StorePlanId (the plan source of truth), NEVER from
        // PaymentStartDate — every store's clock starts at creation, so the anchor no
        // longer discriminates plan state.
        bool isPaid = store.StorePlanId != (int)StorePlanType.Gratis;
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
    /// Free -&gt; Paid: keep the anchor untouched, pin the override per the owner-plan-change
    /// rule (paid target while overdue → today), activate ALL paid modules (PriceIncluded=false),
    /// and generate/activate their StoreRoleFeatures.
    /// </summary>
    private async Task ApplyFreeToPaid(Store store)
    {
        store.StorePlanId = (int)StorePlanType.Pago;
        await ApplyOverrideRule(store);

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
    /// Paid -&gt; Free: keep the anchor (NEVER null it), flip StorePlanId to Gratis, clear any
    /// pinned override, soft-delete ALL paid StoreModules (IsActive=false), deactivate their
    /// StoreRoleFeatures. Free modules untouched.
    /// </summary>
    private async Task ApplyPaidToFree(Store store)
    {
        store.StorePlanId = (int)StorePlanType.Gratis;
        store.NextDueDateOverride = null;

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

    /// <summary>
    /// Paid target while overdue → pin the next payment date to today (existing grace window
    /// covers the payment period). A null anchor (legacy row) never gets a pin — no clock,
    /// no due date.
    /// </summary>
    private async Task ApplyOverrideRule(Store store)
    {
        if (store.PaymentStartDate is null)
            return;

        DateOnly today = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime);
        int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();
        var lastPayment = await _storePaymentRepository.GetLastByStoreIdAsync(store.Id);
        DateOnly? lastPaidBeforeDate = lastPayment is null
            ? null
            : DateOnly.FromDateTime(lastPayment.PaymentBeforeDate.UtcDateTime);
        DateOnly? computedDue = StoreBillingUtils.GetNextDueDate(store.PaymentStartDate, trialMonths, lastPaidBeforeDate,
            store.NextDueDateOverride);

        if (computedDue.HasValue && computedDue.Value <= today)
            store.NextDueDateOverride = today;
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
