using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;

namespace Domain.Interfaces.Repositories
{
    public interface IStoreRoleFeatureRepository : IGenericRepository<StoreRoleFeature>
    {
        Task<IEnumerable<StoreRoleFeature>> GetStoreRoleFeaturesByUserIdAsync(Guid userId);
        Task<bool> HasOwnerAnyFeatureAsync(Guid userId, List<StoreRoleFeatures> storeRoleFeatures);
        Task<bool> HasUserAnyFeatureInStoreAsync(Guid userId, Guid storeId, List<StoreRoleFeatures> storeRoleFeatures);
    }
}
