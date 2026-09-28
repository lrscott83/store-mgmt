using Domain.Common.Repositories;
using Domain.Entities.WebCatalog;

namespace Domain.Interfaces.Repositories
{
    /// <summary>Categorías publicadas del catálogo web (plan 2026-09-27).</summary>
    public interface ICatalogCategoryRepository : IGenericRepository<CatalogCategory, Guid>
    {
        /// <summary>Filas publicadas de una tienda (lectura de la sincronización, con tenant).</summary>
        Task<IList<CatalogCategory>> GetByStoreIdAsync(Guid storeId);

        /// <summary>
        /// Categorías publicadas y activas de una tienda para la vista pública. Ignora el filtro de
        /// tenant a propósito: el catálogo público se lee sin sesión y lo acota el StoreId resuelto
        /// por el slug.
        /// </summary>
        Task<IList<CatalogCategory>> GetPublishedByStoreIdAsync(Guid storeId);
    }
}
