using Domain.Entities.ProductCategories;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductCategoryRepository : GenericRepository<ProductCategory, Guid>, IProductCategoryRepository
    {
        private readonly DbSet<ProductCategory> _productCategories;
        public ProductCategoryRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _productCategories = dbContext.Set<ProductCategory>();
        }

        public async Task<List<ProductCategory>> FindProductCategoriesByNames(HashSet<string> categoryNames)
        {
            List<string> names = categoryNames.ToList();
            return await _productCategories.Where(category => names.Contains(category.Name)).ToListAsync();
        }

        public async Task<int> GetMaxOrderAsync()
        {
            return await _productCategories.MaxAsync(category => category.Order);
        }

        public async Task<IEnumerable<ProductCategory>> GetProductCategoriesAsync(bool includeInactive)
        {
            return await _productCategories
                .Where(c  => c.IsActive && c.Products.Any(p => p.IsActive && p.AvailableToSale))
                .ToListAsync(); 
        }

        public async Task<bool> HasAnyAvailableCategoryByStoreId(Guid id)
        {
            return await _productCategories.AnyAsync(c => c.StoreId == id && c.IsActive);
        }

        public async Task<bool> IsUniqueLoginAsync(string name)
        {
            return await Task.FromResult(_productCategories.All(t => t.Name != name));
        }
    }
}
