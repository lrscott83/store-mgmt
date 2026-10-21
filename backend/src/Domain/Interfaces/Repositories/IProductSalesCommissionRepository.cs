using Domain.Common.Repositories;
using Domain.Entities.ProductSalesCommissions;

namespace Domain.Interfaces.Repositories
{
    public interface IProductSalesCommissionRepository
        : IGenericRepository<ProductSalesCommission, Guid>
    {
        Task<ProductSalesCommission?> GetByProductIdAsync(Guid productId);

        Task<IReadOnlyList<ProductSalesCommission>> GetByStoreIdAsync(Guid storeId);
    }
}
