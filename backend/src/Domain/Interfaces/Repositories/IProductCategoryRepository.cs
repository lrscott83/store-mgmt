using Domain.Common.Repositories;
using Domain.Entities.ProductCategories;

namespace Domain.Interfaces.Repositories
{
    public interface IProductCategoryRepository : IGenericRepository<ProductCategory, Guid>
    {
        Task<List<ProductCategory>> FindProductCategoriesByNames(HashSet<string> categoryNames);
        Task<int> GetMaxOrderAsync();
        Task<IEnumerable<ProductCategory>> GetProductCategoriesAsync(bool includeInactive);

        /// <summary>
        /// TODAS las categorías de una tienda (activas e inactivas) tal como están en el origen.
        /// Es la lectura de la sincronización del catálogo web, no el listado de venta.
        /// </summary>
        Task<IList<ProductCategory>> GetByStoreIdAsync(Guid storeId);
        Task<bool> HasAnyAvailableCategoryByStoreId(Guid id);
        Task<bool> IsUniqueLoginAsync(string name);
    }
}
