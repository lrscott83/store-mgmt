using Application.Abstractions.Time;
using Domain.Entities.Modules;
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
        private readonly IModuleRepository _moduleRepository;
        private readonly IFeatureRepository _featureRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IStoreRoleFeatureGenerator _storeRoleFeaturesGenerator;
        private readonly IDateTimeProvider _dateTimeProvider;
        public CreateStoreService(IStoreRepository storeRepository, IModuleRepository moduleRepository,
            IStoreModuleRepository storeModuleRepository, IOwnerRepository ownerRepository,
            IStoreRoleFeatureRepository storeRoleFeatureRepository, IStoreRoleFeatureGenerator storeRoleFeaturesGenerator,
            IFeatureRepository featureRepository, IDateTimeProvider dateTimeProvider)
        {
            _storeRepository = storeRepository;
            _moduleRepository = moduleRepository;
            _storeModuleRepository = storeModuleRepository;
            _ownerRepository = ownerRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _storeRoleFeaturesGenerator = storeRoleFeaturesGenerator;
            _featureRepository = featureRepository;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<Store> CreateStoreAsync(Guid ownerId, Guid tenantId, string name, string? address, string? description,
            bool approved, List<int> moduleIds)
        {
            // Every created store starts its trial clock unconditionally (paid or free-only modules).
            // Identical derivation to UpdateStoreCommandHandler.cs's activation-on-first-paid conditional,
            // so the two paths cannot drift.
            var store = Store.Create(name, ownerId, approved, tenantId,
                DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime), address, description);
            await _storeRepository.AddAsync(store);

            var modules = (await _moduleRepository.GetModulesByIdsAsync(moduleIds)).ToDictionary(m => m.Id);
            var storeModules = new List<StoreModule>(moduleIds.Count);
            for (int i = 0; i < moduleIds.Count; i++)
            {
                int moduleId = moduleIds[i];
                if (modules.TryGetValue(moduleId, out var module))
                {
                    var storeModule = StoreModule.Create(store.Id, moduleId, module.Price, module.PriceIncluded,
                        module.Price, module.DiscountPrice, module.PercentDiscountPrice, tenantId);
                    storeModules.Add(storeModule);
                }
            }
            if (storeModules.Count > 0)
            {
                await _storeModuleRepository.AddRangeAsync(storeModules);
            }

            List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync(moduleIds);
            var storeRoleFeatures = await _storeRoleFeaturesGenerator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds);
            if (storeRoleFeatures.Count > 0)
                await _storeRoleFeatureRepository.AddRangeAsync(storeRoleFeatures);

            return store;
        }
    }
}
