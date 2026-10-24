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
        /// `true` solo si el producto pertenece a una categoría de ESA tienda. Es la puerta para
        /// configurar una comisión por producto sin aceptar ids de otra tienda.
        /// </summary>
        Task<bool> BelongsToStoreAsync(Guid storeId, Guid productId);

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
        /// <remarks>
        /// PAGINADA y filtrada en SQL, sin traer la galería: el listado público solo usa la imagen
        /// principal (`Product.Image`) y su categoría, así que materializar todo el catálogo por
        /// request (y con `Include(Images)`) era trabajo que la base ya sabe acotar con `LIMIT`.
        /// El filtro por categoría se hace por SLUG (lo que manda el cliente), no por id.
        /// </remarks>
        Task<IList<Product>> GetPublishedPageAsync(Guid storeId, string? categorySlug, string? search,
            int skip, int take, CancellationToken cancellationToken = default);

        /// <summary>Total de productos publicados que cumplen el mismo filtro, contado en SQL.</summary>
        Task<int> CountPublishedAsync(Guid storeId, string? categorySlug, string? search,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Categorías publicadas con su conteo de productos, agrupadas en SQL (`GROUP BY`). La cabecera
        /// solo necesita el nombre, el slug y un número por categoría: traer el producto entero y contar
        /// en memoria dentro de un bucle es O(categorías × productos).
        /// </summary>
        Task<IList<PublishedCategoryCount>> GetPublishedCategoryCountsAsync(Guid storeId,
            CancellationToken cancellationToken = default);

        /// <summary>Detalle público por id dentro de la tienda; null si no está publicado.</summary>
        Task<Product?> GetPublishedByIdAsync(Guid storeId, Guid productId);

        /// <summary>
        /// Varios productos publicados por id, de una sola consulta (carrito de un pedido online,
        /// F2). Mismas puertas que <see cref="GetPublishedByStoreIdAsync"/> —activo, en venta, de
        /// categoría activa con slug público— y por eso NO es un `GetByIdAsync` por producto: N
        /// id contra la base para leer N filas es el N+1 clásico.
        /// </summary>
        Task<IList<Product>> GetPublishedByIdsAsync(Guid storeId, IReadOnlyCollection<Guid> ids);

        /// <summary>
        /// Contadores del estado del catálogo (total, publicados, sin imagen principal) calculados
        /// en SQL: la cabecera de la vista solo necesita números, no materializar el grafo de
        /// productos con su categoría e imágenes.
        /// </summary>
        Task<CatalogProductCounts> CountForCatalogStatusAsync(Guid storeId);

        /// <summary>
        /// Nombres de producto por id, en UNA consulta. Lo usa el panel de estadísticas para
        /// resolver el top de productos sin N+1.
        /// </summary>
        Task<IReadOnlyDictionary<Guid, string>> GetNamesByIdsAsync(
            IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken = default);
    }

    /// <summary>Contadores del catálogo, sin materializar filas.</summary>
    public sealed record CatalogProductCounts(int Total, int Published, int WithoutMainImage);

    /// <summary>Categoría publicada con su conteo de productos (resultado de un GROUP BY en SQL).</summary>
    public sealed record PublishedCategoryCount(Guid CategoryId, string Name, string Slug, int Order, int ProductsCount);
}
