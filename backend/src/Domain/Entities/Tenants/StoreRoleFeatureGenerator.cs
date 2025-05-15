using Domain.Interfaces.Services.Tenants;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.StoreRoleFeatures;
using Domain.Interfaces.Repositories;

namespace Domain.Entities.Tenants
{
    public class StoreRoleFeatureGenerator : IStoreRoleFeatureGenerator
    {
        private readonly IStoreRepository _storeRepository;
        public StoreRoleFeatureGenerator(IStoreRepository storeRepository)
        {
            _storeRepository = storeRepository;
        }

        public async Task<List<StoreRoleFeature>> GenerateStoreRoleFeaturesAsync(Guid storeId, Guid tenantId, IEnumerable<int> featureIds)
        {
            List<Common.Enums.StoreRoleFeatures> storeRoleFeatures = ((Common.Enums.StoreRoleFeatures[])Enum.GetValues(typeof(Common.Enums.StoreRoleFeatures)))
                        .Where(roleFeature => featureIds.Any(id => roleFeature.HasFeature(id)))
                        .ToList();

            List<StoreRoleFeature> roles = [];
            storeRoleFeatures.ForEach(roleFeature =>
            {
                roleFeature.GetRoles().ForEach(role =>
                {
                    FeatureType? featureTypeOpt = roleFeature.GetFeatureType();
                    if (featureTypeOpt.HasValue)
                    {
                        FeatureType featureType = featureTypeOpt.Value;
                        roles.Add(StoreRoleFeature.Create(storeId, (int)role, (int)featureType, tenantId));
                    }
                });
            });
            return roles;
        }
    }
}
