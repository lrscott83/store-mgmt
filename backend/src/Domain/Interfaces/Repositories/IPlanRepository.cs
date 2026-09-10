using Domain.Common.Repositories;
using Domain.Entities.Plans;

namespace Domain.Interfaces.Repositories
{
    public interface IPlanRepository : IGenericRepository<StorePlan, int>
    {
        Task<IEnumerable<StorePlan>> GetActivePlansIncludingModulesForCatalogAsync();

        /// <summary>
        /// Active plan by id including its modules (module features included). VIP is NOT
        /// excluded here — unlike the catalog — so an owner may switch to it explicitly.
        /// </summary>
        Task<StorePlan?> GetActivePlanWithModulesByIdAsync(int planId);
    }
}