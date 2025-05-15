using AutoMapper.Features;
using Domain.Common.Enums;
using Domain.Entities.Features;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class FeatureRepository : GenericRepository<Feature, int>, IFeatureRepository
    {
        private readonly DbSet<Feature> _features;
        public FeatureRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _features = dbContext.Set<Feature>();
        }

        public async Task<List<int>> FilterAvailableToStoreByIds(List<int> featureIds)
        {
            return await _features.Where(f => featureIds.Contains(f.Id) && f.IsActive && f.AvailableToStore)
                .Select(f => f.Id)
                .ToListAsync();
        }

        public async Task<List<int>> GetAvailableFeatureIdsByModuleIdsAsync(List<int> moduleIds)
        {
            return await _features.Where(f => moduleIds.Contains(f.ModuleId) && f.IsActive && f.AvailableToStore)
                .Select(f => f.Id)
                .ToListAsync();
        }

        public async Task<IEnumerable<Feature>> GetAvailableFeaturesToStore()
        {
            return await _features
                .Where(f => f.IsActive && f.Module.IsActive && f.ModuleId != (int)ModuleType.Administration)
                .OrderBy(f => f.Order)
                .Include(f => f.Module)
                .ToListAsync();
        }

        public async Task<IEnumerable<Feature>> GetFeaturesIncludingModuleAsync(bool includeInactive)
        {
            return await _features
                .Where(f => f.IsActive || includeInactive)
                .Include(f => f.Module)
                .ToListAsync();
        }
    }
}
