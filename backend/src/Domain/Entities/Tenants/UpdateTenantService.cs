using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Predicates;
using Domain.Entities.StoreModules;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;
using Microsoft.EntityFrameworkCore;

namespace Domain.Entities.Tenants
{
    public class UpdateTenantService : IUpdateTenantService
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IFeatureRepository _featureRepository;
        private readonly IStoreModuleRepository _tenantFeatureRepository;
        private readonly IRoleRepository _roleRepository;

        public UpdateTenantService(ITenantRepository tenantRepository, IFeatureRepository featureRepository, 
            IStoreModuleRepository tenantFeatureRepository, IRoleRepository roleRepository)
        {
            _tenantRepository = tenantRepository;
            _featureRepository = featureRepository;
            _tenantFeatureRepository = tenantFeatureRepository;
            _roleRepository = roleRepository;
        }

        
        public async Task<bool> UpdateTenantAsync(UpdateTenantRequestModel requestModel)
        {
            requestModel.Tenant.Name = requestModel.Name;
            requestModel.Tenant.Description = requestModel.Description;
            requestModel.Tenant.ConnectionString = requestModel.ConnectionString;
            await _tenantRepository.UpdateAsync(requestModel.Tenant);

            // Update tenant features and application roles
            var applicationRoles = ((Domain.Common.Enums.StoreRoleFeatures[])Enum.GetValues(typeof(Domain.Common.Enums.StoreRoleFeatures)))
                //.Where(role => !role.IsSuperAdminOrTenantAdmin())
                .ToList();
            var validFeaturesIds = requestModel.FeatureIds.Where(TenantPredicates.IsNotTenantFeature()).ToList();
            var features = await _featureRepository.GetAllAsync();
            var tenantFeatures = _tenantFeatureRepository.Where(tf => tf.TenantId == requestModel.Tenant.Id).IgnoreQueryFilters();
            foreach (var feature in features)
            {
                var tenantFeature = tenantFeatures.Where(tm => tm.ModuleId == feature.Id).FirstOrDefault();
                if (validFeaturesIds.Any(id => id == feature.Id))
                {
                    if (tenantFeature is null)
                    {
                        // Insert
                        //var newTenantFeature = StoreFeature.Create(requestModel.Tenant.Id, feature.Id);
                        //await _tenantFeatureRepository.AddAsync(newTenantFeature);

                        // Create Application Roles
                        //var roles = _applicationRoleGenerator.GenerateTenantRoleFeatures(requestModel.Tenant.Id, new List<int> { feature.Id });
                        //foreach (var role in roles)
                        //{
                        //    await _roleRepository.AddAsync(role);
                        //}
                    }
                    else
                    {
                        // Update
                        tenantFeature.IsActive = true;
                        await _tenantFeatureRepository.UpdateAsync(tenantFeature);

                        // Active Application Roles in this feature
                        var applicationRolesToActivate = applicationRoles.Where(r => r.HasFeature(tenantFeature.ModuleId)).ToList();
                        foreach (var applicationRole in applicationRolesToActivate)
                        {
                            var role = await _roleRepository.GetRoleByNameAndTenantIdIgnoreQueryFiltersAsync(applicationRole.GetDisplayName(), requestModel.Tenant.Id);
                            if (role != null)
                            {
                                role.IsActive = true;
                                await _roleRepository.UpdateAsync(role);
                            }
                        }
                    }

                }
                else if (tenantFeature != null)
                {
                    // Delete
                    await _tenantFeatureRepository.DeleteAsync(tenantFeature);

                    // Deactive Application Roles in this feature
                    var applicationRolesToDelete = applicationRoles.Where(r => r.HasFeature(tenantFeature.ModuleId)).ToList();
                    foreach (var applicationRole in applicationRolesToDelete)
                    {
                        var role = await _roleRepository.GetRoleByNameAndTenantIdIgnoreQueryFiltersAsync(applicationRole.GetDisplayName(), requestModel.Tenant.Id);
                        if (role != null)
                            await _roleRepository.DeleteAsync(role);
                    }
                }
            }
            return true;
        }
    }
}
