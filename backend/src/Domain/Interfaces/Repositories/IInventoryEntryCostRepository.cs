using Domain.Common.Repositories;
using Domain.Entities.InventoryEntryCosts;

namespace Domain.Interfaces.Repositories
{
    public interface IInventoryEntryCostRepository : IGenericRepository<InventoryEntryCost, Guid>
    {
        
    }
}
