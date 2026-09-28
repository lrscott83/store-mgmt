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

        /// <summary>
        /// TODOS los productos de las categorías de una tienda, con su categoría y su galería del
        /// catálogo web. Es la lectura de la sincronización (activos e inactivos, en venta o no):
        /// los que dejaron de estar en venta se publican desactivados, nunca se borran (decisión D6).
        /// </summary>
        Task<IList<Product>> GetProductsForCatalogSyncAsync(Guid storeId);
    }
}
