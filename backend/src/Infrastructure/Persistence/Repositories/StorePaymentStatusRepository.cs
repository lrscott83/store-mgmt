using Domain.Entities.StorePaymentStatuses;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StorePaymentStatusRepository : GenericRepository<StorePaymentStatus>, IStorePaymentStatusRepository
    {
        private readonly DbSet<StorePaymentStatus> _storePaymentStatuss;
        public StorePaymentStatusRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storePaymentStatuss = dbContext.Set<StorePaymentStatus>();
        }
    }
}
