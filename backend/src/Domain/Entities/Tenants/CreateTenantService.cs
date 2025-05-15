using Domain.Common.Enums;
using Domain.Common.Predicates;
using Domain.Entities.StoreModules;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;

namespace Domain.Entities.Tenants
{
    public class CreateTenantService : ICreateTenantService
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IStoreModuleRepository _tenantFeatureRepository;
        private readonly IRoleRepository _roleRepository;

        public CreateTenantService(ITenantRepository tenantRepository, IStoreModuleRepository tenantFeatureRepository,
            IRoleRepository roleRepository)
        {
            _tenantRepository = tenantRepository;
            _tenantFeatureRepository = tenantFeatureRepository;
            _roleRepository = roleRepository;
        }

        public async Task<bool> CreateTenantAsync(CreateTenantRequestModel requestModel)
        {
            Tenant tenant = Tenant.Create(requestModel.Name, requestModel.Description, requestModel.ConnectionString);
            await _tenantRepository.AddAsync(tenant);

            // Insert tenant features
            //var validFeaturesIds = requestModel.FeatureIds.Where(TenantPredicates.IsNotTenantFeature()).ToList();
            //validFeaturesIds.ForEach(async featureId =>
            //{
            //    StoreFeature tenantFeature = StoreFeature.Create(tenant.Id, featureId);
            //    await _tenantFeatureRepository.AddAsync(tenantFeature);
            //});

            // Create Application Roles
            //var roles = _tenantRoleGenerator.GenerateTenantRoleFeatures(tenant.Id, validFeaturesIds);
            //foreach (var role in roles)
            //{
            //    await _roleRepository.AddAsync(role);
            //}

            return true;
        }

        
    }
}
