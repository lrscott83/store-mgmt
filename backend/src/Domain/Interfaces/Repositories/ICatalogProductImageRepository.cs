using Domain.Common.Repositories;
using Domain.Entities.WebCatalog;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Galería publicada del catálogo web. La sincronización la reemplaza por producto mediante
    /// <see cref="IGenericRepository{TEntity}.HardDeleteWhereAsync"/> cuando el origen cambia.
    /// </summary>
    public interface ICatalogProductImageRepository : IGenericRepository<CatalogProductImage, Guid>
    {
    }
}
