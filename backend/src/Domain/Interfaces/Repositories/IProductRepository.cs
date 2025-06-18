using Domain.Common.Repositories;
using Domain.Entities.Products;

namespace Domain.Interfaces.Repositories
{
    public interface IProductRepository : IGenericRepository<Product, Guid>
    {
        Task<IEnumerable<Product>> GetAvailableToSaleProductsByCategoryIdAsync(Guid categoryId);
        Task<int> GetMaxOrderAsync();
        Task<IList<Product>> GetProductsByCategoryIdAsync(Guid categoryId);
        Task<IEnumerable<Product>> GetActiveProductsIncludingCategoryByStoreIdAsync(Guid id);
        Task<bool> IsUniqueNameAsync(string name);
        Task<int> GetMaxOrderByCategoryIdAsync(Guid categoryId);
        Task<IEnumerable<Product>> GetAvailableProductsByCategoryIdAsync(Guid categoryId);
        Task<bool> HasAnyAvailableToSaleProductByStoreId(Guid id);
    }
}
