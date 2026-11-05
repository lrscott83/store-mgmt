using Domain.Common.Repositories;
using Domain.Entities.Products;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Escalones de precio mayorista de un producto. Los escribe la sincronización del catálogo
    /// (reemplazo del conjunto completo) y los lee el precio del catálogo y del pedido.
    /// </summary>
    public interface IProductWholesaleTierRepository : IGenericRepository<ProductWholesaleTier, Guid>
    {
        /// <summary>Escalones de un producto, ordenados por <c>MinPacks</c> ascendente.</summary>
        Task<IList<ProductWholesaleTier>> GetByProductIdAsync(Guid productId);
    }
}
