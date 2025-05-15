using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StorePaymentRepository : GenericRepository<StorePayment>, IStorePaymentRepository
    {
        private readonly DbSet<StorePayment> _storePayments;
        public StorePaymentRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storePayments = dbContext.Set<StorePayment>();
        }
    }
}
