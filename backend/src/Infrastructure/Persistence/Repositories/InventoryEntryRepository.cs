using Domain.Entities.InventoryEntries;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class InventoryEntryRepository : GenericRepository<InventoryEntry, Guid>, IInventoryEntryRepository
    {
        private readonly DbSet<InventoryEntry> _inventoryEntrys;
        public InventoryEntryRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _inventoryEntrys = dbContext.Set<InventoryEntry>();
        }
    }
}
