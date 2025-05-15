using Domain.Common.Repositories;
using Domain.Entities.Features;

namespace Domain.Interfaces.Repositories
{
    public interface IFeatureRepository : IGenericRepository<Feature, int>
    {
        Task<List<int>> FilterAvailableToStoreByIds(List<int> featureIds);
        Task<IEnumerable<Feature>> GetAvailableFeaturesToStore();
        Task<List<int>> GetAvailableFeatureIdsByModuleIdsAsync(List<int> moduleIds);
        Task<IEnumerable<Feature>> GetFeaturesIncludingModuleAsync(bool includeInactive);
    }
}
