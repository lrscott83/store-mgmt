using Domain.Common.Repositories;
using Domain.Entities.Products;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Wholesale price tiers of a product. The catalog synchronization writes them (by replacing
    /// the whole set) and both the published catalog and the online order read them.
    /// </summary>
    public interface IProductWholesaleTierRepository : IGenericRepository<ProductWholesaleTier, Guid>
    {
        /// <summary>
        /// Tiers of a product, ordered by <c>MinPacks</c> ascending, read THROUGH the global tenant
        /// filter. This is the safe default: a caller cannot reach another tenant's tiers, not even
        /// with a product id it should not know.
        /// </summary>
        Task<IList<ProductWholesaleTier>> GetByProductIdAsync(Guid productId);

        /// <summary>
        /// The same read for the ANONYMOUS public-order path, where the ambient context carries no
        /// tenant and the global filter would therefore match zero rows. The bypass is bounded by
        /// the tenant the caller already resolved (from the store's public slug), so it can only
        /// ever see that tenant's rows — never "every tenant's rows".
        /// </summary>
        Task<IList<ProductWholesaleTier>> GetForPublicOrderAsync(Guid productId, Guid tenantId,
            CancellationToken cancellationToken = default);
    }
}
