using Domain.Common.Repositories;
using Domain.Entities.Products;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Wholesale price tiers of a product, kept in their own table (<c>ProductWholesaleTier</c>)
    /// because a product has 1..N of them. This repository owns TWO reads, each one served by a
    /// different caller in a different context; it is NOT the read path of the published catalog.
    ///
    ///   * WRITE — the catalog synchronization (store management, with a session) replaces the whole
    ///     set of a product. It is the only writer; nothing here reads back what it wrote.
    ///   * PUBLISHED CATALOG (public, anonymous) — does NOT call this repository. The catalog query
    ///     loads <c>Product.WholesaleTiers</c> through an <c>Include</c> in <c>ProductRepository</c>,
    ///     so the tiers travel with the product row in the same statement.
    ///   * SESSION read (authenticated) — <see cref="GetByProductIdAsync"/>, global tenant filter
    ///     kept. This is the safe default for any caller that DOES have a tenant in its context.
    ///   * ANONYMOUS order read — <see cref="GetForPublicOrderAsync"/>, the only method that bypasses
    ///     the global filters, and only because the request that needs it has no session at all.
    ///
    /// The split exists so the bypass stays auditable: exactly one method reaches past the global
    /// tenant filter, and it does so with an explicit tenant in its predicate. A single method with
    /// the bypass would hand that power to every caller, including the ones that must never have it.
    /// </summary>
    public interface IProductWholesaleTierRepository : IGenericRepository<ProductWholesaleTier, Guid>
    {
        /// <summary>
        /// Tiers of a product, ordered by <c>MinPacks</c> ascending, read THROUGH the global tenant
        /// filter. Callers are SESSION-scoped readers: the request already carries a tenant, and the
        /// filter is what keeps it from reading another tenant's configuration even with a product
        /// id it should not know. Ordered by <c>MinPacks</c> because the applicable tier is the one
        /// with the highest minimum that does not exceed the packs ordered, so the read hands the
        /// caller that order instead of making it sort.
        /// </summary>
        Task<IList<ProductWholesaleTier>> GetByProductIdAsync(Guid productId);

        /// <summary>
        /// The same read for the ANONYMOUS public-order path (the <c>CreateOnlineOrder</c> handler
        /// reached from the store's public slug), where the ambient context carries no tenant and
        /// the global filter would therefore match zero rows — silently. This is the ONLY method
        /// that bypasses the filters. What makes it safe is not the caller's good faith but the
        /// second predicate: the tenant is explicit and the caller can only supply the one the slug
        /// already proved it resolved, so the result is bounded to that tenant's rows even with
        /// every global filter off — never "every tenant's rows".
        /// </summary>
        Task<IList<ProductWholesaleTier>> GetForPublicOrderAsync(Guid productId, Guid tenantId,
            CancellationToken cancellationToken = default);
    }
}
