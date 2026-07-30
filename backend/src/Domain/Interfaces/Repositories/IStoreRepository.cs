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
        Task<int> GetActiveStoreCountAsync();

        Task<Store?> GetStoreWithModulesAndReSellerOwnerAsync(Guid storeId);
        Task<bool> IsStoreOwnedByReSellerUserAsync(Guid storeId, Guid reSellerUserId);

        new Task<bool> ExistsAsync(Guid id);
        Task<IEnumerable<Store>> GetPaidStoresAsync();
        Task<IEnumerable<Store>> GetPaidStoresByReSellerUserAsync(Guid reSellerUserId);
    }
}
