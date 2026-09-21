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
            // Plan 2026-09-21: serves EVERY active plan — VIP included. Caller-based
            // VIP visibility is decided by GetPlansQueryHandler (SuperAdmin only).
            return await _plans
                .Where(p => p.IsActive)
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