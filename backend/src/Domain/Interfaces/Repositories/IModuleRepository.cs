using Domain.Common.Repositories;
using Domain.Entities.Modules;

namespace Domain.Interfaces.Repositories
{
    public interface IModuleRepository : IGenericRepository<Module, int>
    {
        Task<IEnumerable<Module>> GetAvailableModulesToStore();

        /// <summary>
        /// Every module available to stores, ACTIVE OR NOT — the SuperAdmin catalog editor's
        /// universe. Unlike <see cref="GetAvailableModulesToStore"/> it does not filter
        /// <c>IsActive</c>, so a deactivated module stays listable and reactivatable.
        /// </summary>
        Task<IEnumerable<Module>> GetAllModulesAvailableToStore();

        Task<IEnumerable<Module>> GetModulesByIdsAsync(IEnumerable<int> ids);
    }
}
