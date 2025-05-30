using Domain.Entities.InventoryEntryCosts;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class InventoryEntryCostRepository : GenericRepository<InventoryEntryCost, Guid>, IInventoryEntryCostRepository
    {
        private readonly DbSet<InventoryEntryCost> _inventoryEntryCosts;
        public InventoryEntryCostRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _inventoryEntryCosts = dbContext.Set<InventoryEntryCost>();
        }
    }
}
