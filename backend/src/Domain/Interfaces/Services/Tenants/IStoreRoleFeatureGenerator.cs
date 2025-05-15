using Domain.Entities.Roles;
using Domain.Entities.StoreRoleFeatures;

namespace Domain.Interfaces.Services.Tenants
{
    public interface IStoreRoleFeatureGenerator
    {
        public Task<List<StoreRoleFeature>> GenerateStoreRoleFeaturesAsync(Guid storeId, Guid tenantId, IEnumerable<int> featureIds);
    }
}
