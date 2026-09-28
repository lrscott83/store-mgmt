using Domain.Entities.WebCatalog;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class CatalogCategoryRepository : GenericRepository<CatalogCategory, Guid>, ICatalogCategoryRepository
    {
        private readonly DbSet<CatalogCategory> _catalogCategories;

        public CatalogCategoryRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _catalogCategories = dbContext.Set<CatalogCategory>();
        }

        public async Task<IList<CatalogCategory>> GetByStoreIdAsync(Guid storeId)
        {
            return await _catalogCategories
                .Where(category => category.StoreId == storeId)
                .OrderBy(category => category.Order)
                .ToListAsync();
        }

        public async Task<IList<CatalogCategory>> GetPublishedByStoreIdAsync(Guid storeId)
        {
            return await _catalogCategories
                .IgnoreQueryFilters()
                .Where(category => category.StoreId == storeId && category.IsActive)
                .OrderBy(category => category.Order).ThenBy(category => category.Name)
                .ToListAsync();
        }
    }
}
