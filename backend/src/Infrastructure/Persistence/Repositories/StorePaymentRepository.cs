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

        public async Task<StorePayment?> GetLastByStoreIdAsync(Guid storeId)
            => await _storePayments
                .Where(sp => sp.StoreId == storeId)
                .OrderByDescending(sp => sp.PaymentBeforeDate)
                .FirstOrDefaultAsync();

        public async Task<IEnumerable<StorePayment>> GetByStoreIdAsync(Guid storeId)
            => await _storePayments
                .Where(sp => sp.StoreId == storeId)
                .OrderByDescending(sp => sp.Year).ThenByDescending(sp => sp.Month)
                .ToListAsync();

        public async Task<int> GetPaidMonthsCountAsync(Guid storeId)
            => await _storePayments
                .CountAsync(sp => sp.StoreId == storeId
                    && sp.StorePaymentStatusId == (int)Domain.Common.Enums.StorePaymentStatusType.Paid);

        public async Task<IEnumerable<StorePayment>> GetAllPaidWithReSellerAsync()
            => await _storePayments
                .Where(p => p.StorePaymentStatusId == (int)Domain.Common.Enums.StorePaymentStatusType.Paid
                    && p.ReSellerId != null)
                .ToListAsync();

        public async Task<IEnumerable<StorePayment>> GetPaidWithReSellerByReSellerUserAsync(Guid reSellerUserId)
            => await _storePayments
                .Include(p => p.Store)
                    .ThenInclude(s => s.Owner)
                    .ThenInclude(o => o.ReSellerOwner)
                    .ThenInclude(rso => rso.ReSeller)
                .Where(p => p.StorePaymentStatusId == (int)Domain.Common.Enums.StorePaymentStatusType.Paid
                    && p.ReSellerId != null
                    && p.Store.Owner.ReSellerOwner != null
                    && p.Store.Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId)
                .IgnoreQueryFilters()
                .ToListAsync();
    }
}
