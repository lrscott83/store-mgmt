using Domain.Common.Repositories;
using Domain.Entities.ProductCategories;

namespace Domain.Interfaces.Repositories
{
    public interface IProductCategoryRepository : IGenericRepository<ProductCategory, Guid>
    {
        Task<IEnumerable<ProductCategory>> GetProductCategoriesAsync(bool includeInactive);
    }
}
