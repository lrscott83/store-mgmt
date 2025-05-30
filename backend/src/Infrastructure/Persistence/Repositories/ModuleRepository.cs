using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ModuleRepository : GenericRepository<Module, int>, IModuleRepository
    {
        private readonly DbSet<Module> _modules;
        public ModuleRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _modules = dbContext.Set<Module>();
        }

        public async Task<IEnumerable<Module>> GetAvailableModulesToStore()
        {
            return await _modules
                .Where(m => m.IsActive && m.AvailableToStore
                    && m.Features.Any(f => f.IsActive && f.AvailableToStore))
                .OrderByDescending(f => f.PriceIncluded).ThenBy(f => f.Order)
                .ToListAsync();
        }
    }
}
