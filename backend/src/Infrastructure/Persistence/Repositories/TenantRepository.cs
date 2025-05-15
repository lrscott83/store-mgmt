using Domain.Entities.Tenants;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class TenantRepository : GenericRepository<Tenant, Guid>, ITenantRepository
    {
        private readonly DbSet<Tenant> _tenants;
        public TenantRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _tenants = dbContext.Set<Tenant>();
        }

        //public async Task<Tenant> GetTenantByIdIncludingActiveFeaturesAndIgnoreQueryFiltersAsync(Guid id)
        //{
        //    return await _tenants.Where(t => t.Id == id)
        //        .Include(t => t
        //            .Where(tf => tf.IsActive && tf.Feature.IsActive && tf.Feature.Module.IsActive)
        //            .OrderBy(tf => tf.Feature.Order))
        //        .ThenInclude(tm => tm.Feature).ThenInclude(f => f.Module)
        //        .IgnoreQueryFilters()
        //        .FirstOrDefaultAsync();
        //}

        //public async Task<IEnumerable<Tenant>> GetTenantsIncludingActiveFeaturesAndIgnoreQueryFiltersAsync()
        //{
        //    return await _tenants
        //        .Include(t => t.TenantFeatures
        //            .Where(tf => tf.IsActive && tf.Feature.IsActive && tf.Feature.Module.IsActive)
        //            .OrderBy(tf => tf.Feature.Order))
        //        .ThenInclude(tf => tf.Feature).ThenInclude(f => f.Module)
        //        .IgnoreQueryFilters()
        //        .ToListAsync();
        //}

        public async Task<bool> IsUniqueNameAsync(string name)
        {
            return await Task.FromResult(_tenants.All(t => t.Name != name));
        }
    }
}
