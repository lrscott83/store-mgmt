using Domain.Common.Repositories;
using Domain.Entities.StorePayments;

namespace Domain.Interfaces.Repositories
{
    public interface IStorePaymentRepository : IGenericRepository<StorePayment>
    {
        Task<StorePayment?> GetLastByStoreIdAsync(Guid storeId);
        Task<IEnumerable<StorePayment>> GetByStoreIdAsync(Guid storeId);
        Task<int> GetPaidMonthsCountAsync(Guid storeId);
        Task<IEnumerable<StorePayment>> GetAllPaidWithReSellerAsync();
        Task<IEnumerable<StorePayment>> GetPaidWithReSellerByReSellerUserAsync(Guid reSellerUserId);
    }
}
