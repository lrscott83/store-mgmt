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

        /// <summary>
        /// Lectura del catálogo PÚBLICO sobre esta tabla (publicación directa, decisión del Owner
        /// 2026-09-28): solo productos activos y en venta de categorías activas con slug público.
        /// No existe una copia publicada.
        /// </summary>
        Task<IList<Product>> GetPublishedByStoreIdAsync(Guid storeId, Guid? categoryId, string? search);

        /// <summary>Detalle público por id dentro de la tienda; null si no está publicado.</summary>
        Task<Product?> GetPublishedByIdAsync(Guid storeId, Guid productId);

        /// <summary>
        /// Varios productos publicados por id, de una sola consulta (carrito de un pedido online,
        /// F2). Mismas puertas que <see cref="GetPublishedByStoreIdAsync"/> —activo, en venta, de
        /// categoría activa con slug público— y por eso NO es un `GetByIdAsync` por producto: N
        /// id contra la base para leer N filas es el N+1 clásico.
        /// </summary>
        Task<IList<Product>> GetPublishedByIdsAsync(Guid storeId, IReadOnlyCollection<Guid> ids);
    }
}
