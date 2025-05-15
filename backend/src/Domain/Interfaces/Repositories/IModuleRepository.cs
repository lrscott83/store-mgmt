using Domain.Common.Repositories;
using Domain.Entities.Modules;

namespace Domain.Interfaces.Repositories
{
    public interface IModuleRepository : IGenericRepository<Module, int>
    {
        Task<IEnumerable<Module>> GetAvailableModulesToStore();
    }
}
