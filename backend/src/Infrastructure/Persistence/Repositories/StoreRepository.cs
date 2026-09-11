using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.Tenants;
using Domain.Interfaces.Repositories;
using Domain.Common.Constants;
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

        public async Task<IEnumerable<Store>> GetActiveStoresByUserIdAsync(Guid userId, Guid? excludeStoreId = null)
        {
            IQueryable<Store> query = _stores
                .Where(s => s.Owner != null && s.Owner.IsActive && s.Owner.UserId == userId && s.IsActive)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User);

            if (excludeStoreId.HasValue)
                query = query.Where(s => s.Id != excludeStoreId.Value);

            return await query.ToListAsync();
        }

        public async Task<IEnumerable<Store>> GetAllStoresByOwnerUserIdAsync(Guid userId, Guid? excludeStoreId = null)
        {
            // Same shape as GetActiveStoresByUserIdAsync MINUS the s.IsActive filter:
            // the owner's listing must include their inactive stores too. The global
            // tenant query filter (StoreEntityTypeConfiguration: IsSuperAdmin ||
            // TenantId == context.TenantId) is deliberately LEFT ACTIVE — no
            // IgnoreQueryFilters here; tenant isolation is not part of this change.
            // StoreModules + Module are loaded so the DTO mapping gets the store's
            // own price snapshot (the plain active-listing repo never includes them).
            IQueryable<Store> query = _stores
                .Where(s => s.Owner != null && s.Owner.UserId == userId)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.StoreModules)
                    .ThenInclude(sm => sm.Module);

            if (excludeStoreId.HasValue)
                query = query.Where(s => s.Id != excludeStoreId.Value);

            return await query.ToListAsync();
        }

        public async Task<IEnumerable<Store>> GetAllStoresWithModulesAsync(Guid? excludeStoreId = null)
        {
            // SuperAdmin branch of my-stores: every store across every tenant, active
            // AND inactive — same shape as GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync
            // (IgnoreQueryFilters is what grants the cross-tenant reach; the SuperAdmin
            // claim is the only caller of this method) plus the StoreModules snapshot.
            IQueryable<Store> query = _stores
                .IgnoreQueryFilters()
                .Where(s => s.Owner != null)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.StoreModules)
                    .ThenInclude(sm => sm.Module);

            if (excludeStoreId.HasValue)
                query = query.Where(s => s.Id != excludeStoreId.Value);

            return await query.ToListAsync();
        }

        public async Task<IEnumerable<Store>> GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(Guid userId, Guid? excludeStoreId = null)
        {
            IQueryable<Store> query = _stores
                .Where(s => s.Owner != null && s.Owner.IsActive && s.Owner.UserId == userId && s.IsActive)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .IgnoreQueryFilters();

            if (excludeStoreId.HasValue)
                query = query.Where(s => s.Id != excludeStoreId.Value);

            return await query.ToListAsync();
        }

        public async Task<IEnumerable<Store>> GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(Guid? excludeStoreId = null)
        {
            // StoreModules + Module are loaded so the DTO mapping gets the store's own
            // price snapshot (ModuleProfile's StoreModule map reads sm.Module fields;
            // EF Core has no lazy-loading here, so the navigation must be included) —
            // same shape as GetAllStoresWithModulesAsync below.
            IQueryable<Store> query = _stores
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.StoreModules)
                    .ThenInclude(sm => sm.Module)
                .IgnoreQueryFilters();

            if (excludeStoreId.HasValue)
                query = query.Where(s => s.Id != excludeStoreId.Value);

            return await query.ToListAsync();
        }

        public async Task<Store> GetStoreByIdIgnoreQueryFiltersAsync(Guid id)
        {
            return await _stores.Where(s => s.Id == id).IgnoreQueryFilters().FirstOrDefaultAsync();
        }

        public async Task<Store?> GetStoreByIdAsync(Guid id)
        {
            return await _stores.Where(s => s.Id == id).FirstOrDefaultAsync();
        }

        public async Task<Store> GetStoreByIdIncludingModulesAsync(Guid id)
        {
            return await _stores.Where(s => s.Id == id)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.StoreModules.Where(sm => sm.IsActive))
                .ThenInclude(sm => sm.Module)
                .FirstOrDefaultAsync();
        }

        public async Task<Store> GetStoreByIdIncludingModulesIgnoreQueryFiltersAsync(Guid id)
        {
            return await _stores.Where(s => s.Id == id)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.StoreModules.Where(sm => sm.IsActive))
                .ThenInclude(sm => sm.Module)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public new async Task<bool> ExistsAsync(Guid id)
        {
            return await _stores.IgnoreQueryFilters().AnyAsync(s => s.Id == id);
        }

        public async Task<IEnumerable<Store>> GetStoresAsync(bool includeInactive)
        {
            return await _stores
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Where(s => includeInactive || s.IsActive)
                .ToListAsync();
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
                    .ThenInclude(o => o.User)
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

        public async Task<IEnumerable<Store>> GetActiveStoresByReSellerUserIdAsync(Guid reSellerUserId, Guid? excludeStoreId = null)
        {
            IQueryable<Store> query = _stores
                .Include(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(s => s.Owner)
                    .ThenInclude(o => o.ReSellerOwner)
                        .ThenInclude(rso => rso.ReSeller)
                .Where(s => s.IsActive
                    && s.Owner.ReSellerOwner != null
                    && s.Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId)
                .IgnoreQueryFilters();

            if (excludeStoreId.HasValue)
                query = query.Where(s => s.Id != excludeStoreId.Value);

            return await query.ToListAsync();
        }

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
