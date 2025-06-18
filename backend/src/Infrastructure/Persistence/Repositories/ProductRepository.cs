using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductRepository : GenericRepository<Product, Guid>, IProductRepository
    {
        private readonly DbSet<Product> _products;
        public ProductRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _products = dbContext.Set<Product>();
        }

        public async Task<IEnumerable<Product>> GetAvailableToSaleProductsByCategoryIdAsync(Guid categoryId)
        {
            return await _products
                .Where(product => product.IsActive && product.AvailableToSale
                    && product.CategoryId == categoryId && product.Category.IsActive)
                .OrderBy(product => product.Order)
                .ToListAsync();
        }

        public async Task<int> GetMaxOrderAsync()
        {
            return await _products.MaxAsync(product => product.Order);
        }

        public async Task<IList<Product>> GetProductsByCategoryIdAsync(Guid categoryId)
        {
            return await _products
                .Where(product => product.CategoryId == categoryId)
                .OrderBy(product => product.Order)
                .ToListAsync();
        }

        public async Task<IEnumerable<Product>> GetActiveProductsIncludingCategoryByStoreIdAsync(Guid storeId)
        {
            return await _products
                .Where(product => product.IsActive && product.Category.StoreId == storeId)
                .OrderBy(product => product.Category.Order).ThenBy(product => product.Order)
                .Include(product => product.Category)
                .ToListAsync();
        }

        public async Task<bool> IsUniqueNameAsync(string name)
        {
            return await Task.FromResult(_products.All(t => t.Name != name));
        }

        public async Task<int> GetMaxOrderByCategoryIdAsync(Guid categoryId)
        {
            return (await _products
                .Where(product => product.CategoryId == categoryId)
                .MaxAsync(product => product.Order)) + 1;
        }

        public async Task<IEnumerable<Product>> GetAvailableProductsByCategoryIdAsync(Guid categoryId)
        {
            return await _products
               .Where(product => product.IsActive && product.CategoryId == categoryId && product.Category.IsActive)
               .OrderBy(product => product.Order)
               .ToListAsync();
        }

        public async Task<bool> HasAnyAvailableToSaleProductByStoreId(Guid id)
        {
            return await _products.AnyAsync(product => product.IsActive && product.AvailableToSale
                && product.Category.IsActive);

        }
    }
}
