using Domain.Entities.WebCatalog;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class CatalogProductRepository : GenericRepository<CatalogProduct, Guid>, ICatalogProductRepository
    {
        private readonly DbSet<CatalogProduct> _catalogProducts;

        public CatalogProductRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _catalogProducts = dbContext.Set<CatalogProduct>();
        }

        public async Task<IList<CatalogProduct>> GetByStoreIdAsync(Guid storeId)
        {
            return await _catalogProducts
                .Where(product => product.StoreId == storeId)
                .Include(product => product.Images)
                .ToListAsync();
        }

        public async Task<IList<CatalogProduct>> GetPublishedByStoreIdAsync(Guid storeId, Guid? catalogCategoryId, string? search)
        {
            IQueryable<CatalogProduct> query = _catalogProducts
                .IgnoreQueryFilters()
                .Where(product => product.StoreId == storeId && product.IsActive)
                .Include(product => product.Images)
                .Include(product => product.CatalogCategory);

            if (catalogCategoryId.HasValue)
                query = query.Where(product => product.CatalogCategoryId == catalogCategoryId.Value);

            if (!string.IsNullOrWhiteSpace(search))
            {
                string term = search.Trim().ToLowerInvariant();
                query = query.Where(product => product.Name.ToLower().Contains(term));
            }

            return await query
                .OrderBy(product => product.CatalogCategory.Order)
                .ThenBy(product => product.Order)
                .ThenBy(product => product.Name)
                .ToListAsync();
        }

        public async Task<CatalogProduct?> GetPublishedByIdAsync(Guid storeId, Guid catalogProductId)
        {
            return await _catalogProducts
                .IgnoreQueryFilters()
                .Where(product => product.StoreId == storeId && product.Id == catalogProductId && product.IsActive)
                .Include(product => product.Images)
                .Include(product => product.CatalogCategory)
                .FirstOrDefaultAsync();
        }
    }
}
