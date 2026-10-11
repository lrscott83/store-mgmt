using Application.Abstractions.Time;
using Domain.Common.Enums;
using Domain.Entities.Plans;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Domain.Interfaces.Services.Tenants;

namespace Application.Services.Stores
{
    public class CreateStoreService : ICreateStoreService
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IPlanRepository _planRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IStoreRoleFeatureGenerator _storeRoleFeaturesGenerator;
        private readonly IFeatureRepository _featureRepository;
        private readonly IDateTimeProvider _dateTimeProvider;
        public CreateStoreService(IStoreRepository storeRepository, IPlanRepository planRepository,
            IStoreModuleRepository storeModuleRepository, IOwnerRepository ownerRepository,
            IStoreRoleFeatureRepository storeRoleFeatureRepository, IStoreRoleFeatureGenerator storeRoleFeaturesGenerator,
            IFeatureRepository featureRepository, IDateTimeProvider dateTimeProvider)
        {
            _storeRepository = storeRepository;
            _planRepository = planRepository;
            _storeModuleRepository = storeModuleRepository;
            _ownerRepository = ownerRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _storeRoleFeaturesGenerator = storeRoleFeaturesGenerator;
            _featureRepository = featureRepository;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<Store> CreateStoreAsync(Guid ownerId, Guid tenantId, string name, string? address, string? description,
            bool approved)
        {
            // Every created store starts its trial clock unconditionally (paid or free-only modules).
            // Identical derivation to UpdateStoreCommandHandler.cs's activation-on-first-paid conditional,
            // so the two paths cannot drift.
            var store = Store.Create(name, ownerId, approved, tenantId,
                DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime), address, description,
                (int)StorePlanType.Superior);
            await _storeRepository.AddAsync(store);

            // store-birth-superior (2026-10-11, replaces store-birth-pago-only): the module set is
            // DERIVED from the birth plan, never supplied by the caller. The plan catalog is the
            // single source of truth; the Module.IsActive / Module.AvailableToStore filter is what
            // keeps a retired or restricted catalog member out of a brand-new store (and excludes
            // the VIP-only 16 by construction, since Superior does not carry it).
            var plan = await _planRepository.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior);
            var birthModules = (plan?.StorePlanModules ?? Enumerable.Empty<StorePlanModule>())
                .Where(spm => spm.Module is not null && spm.Module.IsActive && spm.Module.AvailableToStore)
                .Select(spm => spm.Module)
                .ToList();

            var storeModules = new List<StoreModule>(birthModules.Count);
            foreach (var module in birthModules)
            {
                var storeModule = StoreModule.Create(store.Id, module.Id, module.Price, module.PriceIncluded,
                    module.Price, module.DiscountPrice, module.PercentDiscountPrice, tenantId);
                storeModules.Add(storeModule);
            }
            if (storeModules.Count > 0)
            {
                await _storeModuleRepository.AddRangeAsync(storeModules);
            }

            var moduleIds = birthModules.Select(m => m.Id).ToList();
            List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync(moduleIds);
            var storeRoleFeatures = await _storeRoleFeaturesGenerator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds);
            if (storeRoleFeatures.Count > 0)
                await _storeRoleFeatureRepository.AddRangeAsync(storeRoleFeatures);

            return store;
        }
    }
}