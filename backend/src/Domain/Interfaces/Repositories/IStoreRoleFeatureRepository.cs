using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;

namespace Domain.Interfaces.Repositories
{
    public interface IStoreRoleFeatureRepository : IGenericRepository<StoreRoleFeature>
    {
        Task<IEnumerable<StoreRoleFeature>> GetAllActiveToStoreByStoreIdAndModuleIdsAsync(Guid storeId, List<int> moduleIds);
        Task<IEnumerable<StoreRoleFeature>> GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(Guid storeId, int moduleId, List<int> featureIds);
        Task<IEnumerable<StoreRoleFeature>> GetStoreRoleFeaturesByUserIdAsync(Guid userId, List<int> storeModuleIds);
        Task<bool> HasOwnerAnyFeatureAsync(Guid userId, List<StoreRoleFeatures> storeRoleFeatures, List<int> storeModuleIds);
        Task<bool> HasUserAnyFeatureInStoreAsync(Guid userId, Guid storeId, List<StoreRoleFeatures> storeRoleFeatures, List<int> storeModuleIds);
    }
}
