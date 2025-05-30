using Domain.Common.Repositories;
using Domain.Entities.InventoryEntries;

namespace Domain.Interfaces.Repositories
{
    public interface IInventoryEntryRepository : IGenericRepository<InventoryEntry, Guid>
    {
        
    }
}
