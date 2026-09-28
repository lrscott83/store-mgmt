using Domain.Common.Repositories;
using Domain.Entities.WebCatalog;

namespace Domain.Interfaces.Repositories
{
    /// <summary>Productos publicados del catálogo web (plan 2026-09-27).</summary>
    public interface ICatalogProductRepository : IGenericRepository<CatalogProduct, Guid>
    {
        /// <summary>Filas publicadas de una tienda con su galería (lectura de la sincronización).</summary>
        Task<IList<CatalogProduct>> GetByStoreIdAsync(Guid storeId);

        /// <summary>
        /// Productos publicados y ACTIVOS para la vista pública (filtro por categoría y búsqueda por
        /// nombre). Ignora el filtro de tenant: se lee sin sesión y lo acota el StoreId del slug.
        /// </summary>
        Task<IList<CatalogProduct>> GetPublishedByStoreIdAsync(Guid storeId, Guid? catalogCategoryId, string? search);

        /// <summary>Detalle publicado de un producto de la tienda (activo), o null.</summary>
        Task<CatalogProduct?> GetPublishedByIdAsync(Guid storeId, Guid catalogProductId);
    }
}
