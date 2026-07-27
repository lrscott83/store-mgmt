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
        public CreateStoreService(IStoreRepository storeRepository, IModuleRepository moduleRepository, 
            IStoreModuleRepository storeModuleRepository, IOwnerRepository ownerRepository,
            IStoreRoleFeatureRepository storeRoleFeatureRepository, IStoreRoleFeatureGenerator storeRoleFeaturesGenerator,
            IFeatureRepository featureRepository)
        {
            _storeRepository = storeRepository;
            _moduleRepository = moduleRepository;
            _storeModuleRepository = storeModuleRepository;
            _ownerRepository = ownerRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _storeRoleFeaturesGenerator = storeRoleFeaturesGenerator;
            _featureRepository = featureRepository;
        }

        public async Task<Store> CreateStoreAsync(Guid ownerId, Guid tenantId, string name, string? address, string? description, 
            bool approved, List<int> moduleIds)
        {
            var store = Store.Create(name, ownerId, approved, tenantId, null, address, description);
            await _storeRepository.AddAsync(store);

            for (int i = 0; i < moduleIds.Count; i++)
            {
                int moduleId = moduleIds[i];
                Module module = await _moduleRepository.GetByIdAsync(moduleId);
                StoreModule storeModule = StoreModule.Create(store.Id, moduleId, module.Price, module.PriceIncluded,
                        module.Price, module.DiscountPrice, module.PercentDiscountPrice, tenantId);
                await _storeModuleRepository.AddAsync(storeModule);
            }

            List<int> featureIds = await _featureRepository.GetAvailableFeatureIdsByModuleIdsAsync(moduleIds);
            var storeRoleFeatures = await _storeRoleFeaturesGenerator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds);
            await Task.WhenAll(storeRoleFeatures.Select(srf => 
                _storeRoleFeatureRepository.AddAsync(srf)));

            return store;
        }
    }
}
