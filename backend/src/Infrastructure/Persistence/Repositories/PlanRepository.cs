using Domain.Common.Enums;
using Domain.Entities.Plans;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class PlanRepository : GenericRepository<StorePlan, int>, IPlanRepository
    {
        private readonly DbSet<StorePlan> _plans;
        public PlanRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _plans = dbContext.Set<StorePlan>();
        }

        public async Task<IEnumerable<StorePlan>> GetActivePlansIncludingModulesForCatalogAsync()
        {
            return await _plans
                .Where(p => p.IsActive && p.Id != (int)StorePlanType.VIP)
                .Include(p => p.StorePlanModules)
                    .ThenInclude(spm => spm.Module)
                        .ThenInclude(m => m.Features)
                .OrderBy(p => p.Order)
                .ToListAsync();
        }

        public async Task<StorePlan?> GetActivePlanWithModulesByIdAsync(int planId)
        {
            return await _plans
                .Where(p => p.IsActive && p.Id == planId)
                .Include(p => p.StorePlanModules)
                    .ThenInclude(spm => spm.Module)
                        .ThenInclude(m => m.Features)
                .FirstOrDefaultAsync();
        }
    }
}