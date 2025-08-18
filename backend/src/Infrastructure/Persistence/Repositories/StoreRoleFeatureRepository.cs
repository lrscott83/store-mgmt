using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreRoleFeatureRepository : GenericRepository<StoreRoleFeature>, IStoreRoleFeatureRepository
    {
        private readonly DbSet<StoreRoleFeature> _storeRoleFeature;
        public StoreRoleFeatureRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storeRoleFeature = dbContext.Set<StoreRoleFeature>();
        }

        public async Task<IEnumerable<StoreRoleFeature>> GetAllActiveToStoreByStoreIdAndModuleIdsAsync(Guid storeId, List<int> moduleIds)
        {
            return await _storeRoleFeature.Where(srf => srf.IsActive && srf.StoreId == storeId && srf.Feature.AvailableToStore 
                && moduleIds.Contains(srf.Feature.ModuleId))
                .IgnoreQueryFilters()
                .ToListAsync();

        }

        public async Task<IEnumerable<StoreRoleFeature>> GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(Guid storeId, int moduleId, List<int> featureIds)
        {
            return await _storeRoleFeature.Where(srf => srf.StoreId == storeId && srf.Feature.AvailableToStore
                && srf.Feature.ModuleId == moduleId && featureIds.Contains(srf.FeatureId))
                .IgnoreQueryFilters()
                .ToListAsync();
        }

        public async Task<IEnumerable<StoreRoleFeature>> GetStoreRoleFeaturesByUserIdAsync(Guid userId, List<int> storeModuleIds)
        {
            return await _storeRoleFeature
                .Where(srf => srf.IsActive && srf.Store.IsActive && srf.Role.IsActive && srf.Feature.IsActive
                    && srf.Feature.Module.IsActive && storeModuleIds.Contains(srf.Feature.Module.Id)
                    && srf.Role.UserRoles.Any(ur => ur.IsActive && ur.User.IsActive && ur.UserId == userId))
                .Include(srf => srf.Role)
                .Include(srf => srf.Feature).ThenInclude(f => f.Module)
                .Include(srf => srf.Store)
                .ToListAsync();
        }

        public async Task<bool> HasOwnerAnyFeatureAsync(Guid userId, List<StoreRoleFeatures> roleFeatures, List<int> storeModuleIds)
        {
            List<int> featureIds = roleFeatures
                .Where(rf => rf.GetFeatureType().HasValue)
                .Select(rf => (int)rf.GetFeatureType().Value).ToList();
            return await _storeRoleFeature
                .AnyAsync(srf => srf.IsActive && srf.Store.IsActive && srf.Role.IsActive
                    && srf.Feature.IsActive && featureIds.Any(id => id == srf.FeatureId)
                    && srf.Feature.Module.IsActive && storeModuleIds.Contains(srf.Feature.Module.Id)
                    && srf.Role.UserRoles.Any(ur => ur.IsActive && ur.User.IsActive && ur.UserId == userId && ur.User.Owner != null));
        }

        public async Task<bool> HasUserAnyFeatureInStoreAsync(Guid userId, Guid storeId, List<StoreRoleFeatures> roleFeatures, List<int> storeModuleIds)
        {
            List<int> featureIds = roleFeatures
                .Where(rf => rf.GetFeatureType().HasValue)
                .Select(rf => (int)rf.GetFeatureType().Value).ToList();
            return await _storeRoleFeature
                .AnyAsync(srf => srf.IsActive && srf.Store.IsActive && srf.Store.Id == storeId && srf.Role.IsActive 
                    && srf.Feature.IsActive && featureIds.Any(id => id == srf.FeatureId)
                    && srf.Feature.Module.IsActive && storeModuleIds.Contains(srf.Feature.Module.Id)
                    && srf.Role.UserRoles.Any(ur => ur.IsActive && ur.User.IsActive && ur.UserId == userId));
        }
    }
}
