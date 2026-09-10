using Domain.Common.Repositories;
using Domain.Entities.Plans;

namespace Domain.Interfaces.Repositories
{
    public interface IPlanRepository : IGenericRepository<StorePlan, int>
    {
        Task<IEnumerable<StorePlan>> GetActivePlansIncludingModulesForCatalogAsync();
    }
}