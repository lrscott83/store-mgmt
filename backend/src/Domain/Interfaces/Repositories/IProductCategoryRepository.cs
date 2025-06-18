using Domain.Common.Repositories;
using Domain.Entities.ProductCategories;

namespace Domain.Interfaces.Repositories
{
    public interface IProductCategoryRepository : IGenericRepository<ProductCategory, Guid>
    {
        Task<List<ProductCategory>> FindProductCategoriesByNames(HashSet<string> categoryNames);
        Task<int> GetMaxOrderAsync();
        Task<IEnumerable<ProductCategory>> GetProductCategoriesAsync(bool includeInactive);
        Task<bool> HasAnyAvailableCategoryByStoreId(Guid id);
        Task<bool> IsUniqueLoginAsync(string name);
    }
}
