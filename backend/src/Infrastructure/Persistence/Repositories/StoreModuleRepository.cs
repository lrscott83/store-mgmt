using AutoMapper.Features;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreModuleRepository : GenericRepository<StoreModule>, IStoreModuleRepository
    {
        private readonly DbSet<StoreModule> _storeModules;
        public StoreModuleRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storeModules = dbContext.Set<StoreModule>();
        }

        public async Task<IEnumerable<Module>> GetAvailableModulesByStoreIdAsync(Guid storeId)
        {
            return await _storeModules
                .Where(sm => sm.IsActive && sm.Module.IsActive && sm.Module.AvailableToStore
                    && sm.Module.Features.Any(f => f.IsActive && f.AvailableToStore)
                    && sm.Store.IsActive && sm.Store.Owner.IsActive && sm.StoreId == storeId)
                .OrderBy(sm => sm.Module.Order)
                .Select(sm => sm.Module)
                .ToListAsync();
        }

        public async Task<IEnumerable<StoreModule>> GetStoreModulesByIdAsync(Guid storeId)
        {
            return await _storeModules.Where(sm => sm.StoreId == storeId).ToListAsync();
        }
    }
}
