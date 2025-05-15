using Domain.Common.Repositories;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;

namespace Domain.Interfaces.Repositories
{
    public interface IStoreModuleRepository : IGenericRepository<StoreModule>
    {
        Task<IEnumerable<Module>> GetAvailableModulesByStoreIdAsync(Guid storeId);
        Task<IEnumerable<StoreModule>> GetStoreModulesByIdAsync(Guid storeId);
    }
}
