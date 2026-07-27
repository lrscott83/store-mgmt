using Domain.Common.Repositories;
using Domain.Entities.Modules;

namespace Domain.Interfaces.Repositories
{
    public interface IModuleRepository : IGenericRepository<Module, int>
    {
        Task<IEnumerable<Module>> GetAvailableModulesToStore();
        Task<IEnumerable<Module>> GetModulesByIdsAsync(IEnumerable<int> ids);
    }
}
