using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Results;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.Roles;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Domain.Interfaces.Services.Tenants;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStore
{
    /// <summary>
    /// Store data update. <c>ModuleIds</c> is optional: when null the store's
    /// modules/plan are left untouched (the plan has its own dedicated update
    /// path through this same command with <c>ModuleIds</c> populated).
    /// </summary>
    public sealed record UpdateStoreCommand(Guid Id, string Name, string? Address, string? Description, 
        bool Approved, List<int>? ModuleIds, bool IsActive, DateOnly? PaymentStartDate = null)
        : ICommand<bool> { }

    public class UpdateStoreCommandHandler : ICommandHandler<UpdateStoreCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStoreRepository _storeRepository;
        private readonly IModuleRepository _moduleRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IFeatureRepository _featureRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IStoreRoleFeatureGenerator _storeRoleFeaturesGenerator;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateStoreCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IStoreRepository storeRepository,
            IModuleRepository moduleRepository,
            IStoreModuleRepository storeModuleRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IGetStoreByIdService storeByIdService,
            IFeatureRepository featureRepository,
            IStoreRoleFeatureGenerator storeRoleFeaturesGenerator,
            IStoreRoleFeatureRepository storeRoleFeatureRepository)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
            _moduleRepository = moduleRepository;
            _storeModuleRepository = storeModuleRepository;
            _localizer = localizer;
            _storeByIdService = storeByIdService;
            _featureRepository = featureRepository;
            _storeRoleFeaturesGenerator = storeRoleFeaturesGenerator;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateStoreCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id);
            if (store is null)
                throw new ValidationException { Errors = new List<Error> { new Error("Id", _localizer["StoreNotFound"]) } };

            // DG-7 one-way plan lock (owner-plan-change): a non-SuperAdmin caller must not
            // change the module set of ANY store — free or paid. Module mutations now have
            // dedicated paths (ChangeStorePlan / ToggleStorePlan); UpdateStore only keeps a
            // same-set save (e.g. renaming) allowed. The store is loaded with its active
            // StoreModules already carrying ModulePriceIncluded, so this guard needs no extra
            // queries. A null ModuleIds (data-only update) requests no module change, so the
            // lock never fires.
            if (request.ModuleIds is not null
                && !_httpContextService.IsSuperAdmin)
            {
                var requested = request.ModuleIds.Distinct().OrderBy(id => id);
                var current = store.StoreModules.Select(sm => sm.ModuleId).Distinct().OrderBy(id => id);
                if (!requested.SequenceEqual(current))
                    throw new ValidationException
                    {
                        Errors = new List<Error> { new Error("PlanLocked", _localizer["PlanLocked"]) }
                    };
            }

            if (_storeRepository.Where(s => s.Id != request.Id).Any(s => s.Name == request.Name))
                throw new ValidationException(_localizer["StoreAlreadyExists"]);

            store.Name = request.Name;
            store.Address = request.Address;
            
            if (_httpContextService.IsSuperAdmin)
            {
                store.Description = request.Description;
                store.Approved = request.Approved;
                store.IsActive = request.IsActive;
            }

            // Explicit PaymentStartDate (SuperAdmin only) is the ONLY way this command writes
            // the billing anchor (owner-plan-change: activation-on-first-paid removed — the
            // anchor is sacred and never fabricated from a module request).
            if (request.PaymentStartDate is not null && _httpContextService.IsSuperAdmin)
                store.PaymentStartDate = request.PaymentStartDate;

            await _storeRepository.UpdateAsync(store);
            if (request.ModuleIds is not null)
                await UpdateStoreModules(store.Id, store.TenantId, request.ModuleIds);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }

        private async Task UpdateStoreModules(Guid storeId, Guid tenantId, List<int> moduleIds)
        {
            IEnumerable<StoreModule> storeModules = await _storeModuleRepository.GetStoreModulesByIdAsync(storeId);

            // Delete
            IEnumerable<StoreModule> storeModulesToDelete = storeModules
                .Where(module => module.IsActive && moduleIds.All(id => module.ModuleId != id))
                .ToList();
            if (storeModulesToDelete.Any())
            {
                foreach (var item in storeModulesToDelete)
                {
                    item.IsActive = false;
                    await _storeModuleRepository.UpdateAsync(item);
                }

                IEnumerable<StoreRoleFeature> storeRoleFeaturesToDelete = await _storeRoleFeatureRepository.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(
                    storeId, storeModulesToDelete.Select(sm => sm.ModuleId).ToList());
                foreach (var storeRoleFeature in storeRoleFeaturesToDelete)
                {
                    storeRoleFeature.IsActive = false;
                    await _storeRoleFeatureRepository.UpdateAsync(storeRoleFeature);
                }
            }

            List<int> insertedModuleIds = new List<int>();
            List<int> updatedModuleIds = new List<int>();
            Dictionary<int, Module> modulesById = (await _moduleRepository.GetModulesByIdsAsync(moduleIds)).ToDictionary(m => m.Id);
            foreach (var moduleId in moduleIds)
            {
                StoreModule? storeModule = storeModules.FirstOrDefault(module => module.ModuleId == moduleId);
                Module module = modulesById[moduleId];
                if (storeModule == null)
                {
                    // Insert
                    storeModule = StoreModule.Create(storeId, moduleId, module.Price, module.PriceIncluded,
                        module.Price, module.DiscountPrice, module.PercentDiscountPrice, tenantId);
                    await _storeModuleRepository.AddAsync(storeModule);
                    insertedModuleIds.Add(moduleId);
                }
                else if (!storeModule.IsActive)
                {
                    // Update
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

            if (insertedModuleIds.Any())
            {
                List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync(insertedModuleIds);
                var storeRoleFeatures = await _storeRoleFeaturesGenerator.GenerateStoreRoleFeaturesAsync(storeId, tenantId, featureIds);
                foreach (var storeRoleFeature in storeRoleFeatures)
                {
                    await _storeRoleFeatureRepository.AddAsync(storeRoleFeature);
                }
            }

            foreach (var updatedModuleId in updatedModuleIds)
            {
                List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync([updatedModuleId]);
                IEnumerable<StoreRoleFeature> storeRoleFeaturesToUpdate = await _storeRoleFeatureRepository.GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(
                    storeId, updatedModuleId, featureIds);

                foreach (var featureId in featureIds)
                {
                    StoreRoleFeature? storeRoleFeature = storeRoleFeaturesToUpdate.FirstOrDefault(srf => srf.FeatureId == featureId);
                    if (storeRoleFeature == null)
                    {
                        // Insert
                        StoreRoleFeature newStoreRoleFeature = StoreRoleFeature.Create(storeId, (int)RoleType.StoreUser, featureId, tenantId);
                        await _storeRoleFeatureRepository.AddAsync(newStoreRoleFeature);
                    }
                    else
                    {
                        // Update
                        storeRoleFeature.IsActive = true;
                        await _storeRoleFeatureRepository.UpdateAsync(storeRoleFeature);
                    }
                }

            }
        }
    }
}
