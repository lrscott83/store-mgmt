using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Tenants;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreRepository : GenericRepository<Store, Guid>, IStoreRepository
    {
        private readonly DbSet<Store> _stores;
        public StoreRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _stores = dbContext.Set<Store>();
        }

        public async Task<IEnumerable<Store>> GetActiveStoresByUserIdAsync(Guid userId)
        {
            return await _stores
                .Where(s => s.Owner != null && s.Owner.IsActive && s.Owner.UserId == userId && s.IsActive)
                .Include(s => s.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Store>> GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(Guid userId)
        {
            return await _stores
                .Where(s => s.Owner != null && s.Owner.IsActive && s.Owner.UserId == userId && s.IsActive)
                .Include(s => s.Owner)
                .IgnoreQueryFilters()
                .ToListAsync();
        }

        public async Task<IEnumerable<Store>> GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync()
        {
            return await _stores
                .Include(s => s.Owner)
                .IgnoreQueryFilters()
                .ToListAsync();
        }

        public async Task<Store> GetStoreByIdIgnoreQueryFiltersAsync(Guid id)
        {
            return await _stores.Where(s => s.Id == id).IgnoreQueryFilters().FirstOrDefaultAsync();
        }

        public async Task<Store> GetStoreByIdIncludingModulesAsync(Guid id)
        {
            return await _stores.Where(s => s.Id == id)
                .Include(s => s.StoreModules.Where(sm => sm.IsActive))
                .ThenInclude(sm => sm.Module)
                .FirstOrDefaultAsync();
        }

        public async Task<Store> GetStoreByIdIncludingModulesIgnoreQueryFiltersAsync(Guid id)
        {
            return await _stores.Where(s => s.Id == id)
                .Include(s => s.StoreModules.Where(sm => sm.IsActive))
                .ThenInclude(sm => sm.Module)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Store>> GetStoresAsync(bool includeInactive)
        {
            return await _stores.Where(s => includeInactive || s.IsActive).ToListAsync();
        }

        public async Task<bool> IsUniqueNameAsync(string name)
        {
            return await Task.FromResult(_stores.All(t => t.Name != name));
        }

        public async Task<int> GetActiveStoreCountAsync()
        {
            return await _stores.Where(store => store.IsActive).CountAsync();
        }

        public async Task<Store?> GetStoreWithModulesAndReSellerOwnerAsync(Guid storeId)
            => await _stores
                .Include(s => s.StoreModules)
                    .ThenInclude(sm => sm.Module)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.ReSellerOwner)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.Id == storeId);

        public async Task<bool> IsStoreOwnedByReSellerUserAsync(Guid storeId, Guid reSellerUserId)
            => await _stores
                .IgnoreQueryFilters()
                .AnyAsync(s => s.Id == storeId
                    && s.Owner.ReSellerOwner != null
                    && s.Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId);

        public async Task<IEnumerable<Store>> GetPaidStoresAsync()
            => await _stores
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.StoreModules)
                    .ThenInclude(sm => sm.Module)
                .Where(s => s.PaymentStartDate != null)
                .IgnoreQueryFilters()
                .ToListAsync();

        public async Task<IEnumerable<Store>> GetPaidStoresByReSellerUserAsync(Guid reSellerUserId)
            => await _stores
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.StoreModules)
                    .ThenInclude(sm => sm.Module)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.ReSellerOwner)
                        .ThenInclude(rso => rso.ReSeller)
                .Where(s => s.PaymentStartDate != null
                    && s.Owner.ReSellerOwner != null
                    && s.Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId)
                .IgnoreQueryFilters()
                .ToListAsync();
    }
}
