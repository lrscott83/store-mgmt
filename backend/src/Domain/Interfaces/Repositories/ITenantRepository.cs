using Domain.Common.Repositories;
using Domain.Entities.Tenants;

namespace Domain.Interfaces.Repositories
{
    public interface ITenantRepository : IGenericRepository<Tenant, Guid>
    {
        Task<bool> IsUniqueNameAsync(string name);
        //Task<Tenant> GetTenantByIdIncludingActiveFeaturesAndIgnoreQueryFiltersAsync(Guid id);
        //Task<IEnumerable<Tenant>> GetTenantsIncludingActiveFeaturesAndIgnoreQueryFiltersAsync();
    }
}
