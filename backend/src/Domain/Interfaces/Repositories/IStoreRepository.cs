using Domain.Common.Repositories;
using Domain.Entities.Stores;

namespace Domain.Interfaces.Repositories
{
    public interface IStoreRepository : IGenericRepository<Store, Guid>
    {
        Task<IEnumerable<Store>> GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(Guid? excludeStoreId = null);
        Task<IEnumerable<Store>> GetStoresAsync(bool includeInactive);
        Task<bool> IsUniqueNameAsync(string name);
        Task<Store> GetStoreByIdIgnoreQueryFiltersAsync(Guid id);
        Task<Store?> GetStoreByIdAsync(Guid id);
        Task<Store> GetStoreByIdIncludingModulesIgnoreQueryFiltersAsync(Guid id);
        Task<Store> GetStoreByIdIncludingModulesAsync(Guid id);
        Task<IEnumerable<Store>> GetActiveStoresByUserIdAsync(Guid userId, Guid? excludeStoreId = null);
        Task<IEnumerable<Store>> GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(Guid userId, Guid? excludeStoreId = null);
        /// <summary>
        /// ALL stores owned by the owner user (active AND inactive — same query as
        /// GetActiveStoresByUserIdAsync minus the s.IsActive filter), with the
        /// store's ACTIVE module snapshot loaded. Backs GET /v1/stores/my-stores.
        /// </summary>
        Task<IEnumerable<Store>> GetAllStoresByOwnerUserIdAsync(Guid userId, Guid? excludeStoreId = null);
        /// <summary>
        /// ALL stores in the system (every tenant, active + inactive) with their
        /// ACTIVE module snapshot — the SuperAdmin branch of my-stores, mirroring
        /// GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync plus the StoreModules
        /// include the listing cards need.
        /// </summary>
        Task<IEnumerable<Store>> GetAllStoresWithModulesAsync(Guid? excludeStoreId = null);
        Task<int> GetActiveStoreCountAsync();

        Task<Store?> GetStoreWithModulesAndReSellerOwnerAsync(Guid storeId);
        Task<bool> IsStoreOwnedByReSellerUserAsync(Guid storeId, Guid reSellerUserId);
        Task<IEnumerable<Store>> GetActiveStoresByReSellerUserIdAsync(Guid reSellerUserId, Guid? excludeStoreId = null);

        new Task<bool> ExistsAsync(Guid id);
        Task<IEnumerable<Store>> GetPaidStoresAsync();
        Task<IEnumerable<Store>> GetPaidStoresByReSellerUserAsync(Guid reSellerUserId);
    }
}
