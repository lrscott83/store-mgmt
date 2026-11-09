using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductWholesaleTierRepository
        : GenericRepository<ProductWholesaleTier, Guid>, IProductWholesaleTierRepository
    {
        private readonly DbSet<ProductWholesaleTier> _tiers;

        public ProductWholesaleTierRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _tiers = dbContext.Set<ProductWholesaleTier>();
        }

        /// <summary>
        /// Tiers of ONE product, ordered by <c>MinPacks</c>: the applicable tier is the one with the
        /// highest minimum that does not exceed the packs ordered, so the order is part of what the
        /// caller expects to read.
        ///
        /// The global tenant filter is DELIBERATELY kept here: this is the safe default, and any
        /// session-scoped caller gets exactly the rows of its own tenant or nothing at all. The
        /// anonymous order path needs a bypass and for that reason has its own method
        /// (<see cref="GetForPublicOrderAsync"/>) instead of loosening this one — a bypass that every
        /// caller inherits is a bypass nobody can audit.
        /// </summary>
        public async Task<IList<ProductWholesaleTier>> GetByProductIdAsync(Guid productId)
        {
            return await _tiers
                .Where(tier => tier.ProductId == productId)
                .OrderBy(tier => tier.MinPacks)
                .ToListAsync();
        }

        /// <summary>
        /// Same read, for the anonymous public-order path.
        ///
        /// `IgnoreQueryFilters` is REQUIRED and not a shortcut: the order POST runs WITHOUT a
        /// session, so `_context.TenantId` is null, the global filter translates to `TenantId =
        /// NULL` and returns ZERO rows. The catalog would then publish wholesale prices that the
        /// order rejects as "not configured", silently.
        ///
        /// What makes the bypass safe is the SECOND predicate: the tenant is passed explicitly and
        /// becomes part of the `WHERE`, so the query cannot return another tenant's rows even though
        /// every global filter is off. The caller resolves the store by its public slug and passes
        /// that store's `TenantId`; the bypass is then bounded by data the request already proved it
        /// owns.
        /// </summary>
        public async Task<IList<ProductWholesaleTier>> GetForPublicOrderAsync(Guid productId,
            Guid tenantId, CancellationToken cancellationToken = default)
        {
            return await _tiers
                .IgnoreQueryFilters()
                .Where(tier => tier.ProductId == productId && tier.TenantId == tenantId)
                .OrderBy(tier => tier.MinPacks)
                .ToListAsync(cancellationToken);
        }
    }
}
