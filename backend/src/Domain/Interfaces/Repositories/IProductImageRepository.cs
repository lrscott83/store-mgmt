using Domain.Common.Repositories;
using Domain.Entities.Products;

namespace Domain.Interfaces.Repositories
{
    /// <summary>Galería del catálogo web de un producto (plan 2026-09-27).</summary>
    public interface IProductImageRepository : IGenericRepository<ProductImage, Guid>
    {
        /// <summary>Imágenes de un producto ordenadas por Order.</summary>
        Task<IList<ProductImage>> GetByProductIdAsync(Guid productId);

        /// <summary>Imagen concreta de un producto (clave = Path), o null si no existe.</summary>
        Task<ProductImage?> GetByProductAndPathAsync(Guid productId, string path);
    }
}
