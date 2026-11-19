using Domain.Entities.StoreClientErrors;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreClientErrorRepository : GenericRepository<StoreClientError, Guid>, IStoreClientErrorRepository
    {
        public StoreClientErrorRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
        }
    }
}
