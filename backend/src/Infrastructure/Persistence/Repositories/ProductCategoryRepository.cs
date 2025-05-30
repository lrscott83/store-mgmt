using Domain.Entities.ProductCategories;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductCategoryRepository : GenericRepository<ProductCategory, Guid>, IProductCategoryRepository
    {
        private readonly DbSet<ProductCategory> _productCategoriess;
        public ProductCategoryRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _productCategoriess = dbContext.Set<ProductCategory>();
        }

        public Task<IEnumerable<ProductCategory>> GetProductCategoriesAsync(bool includeInactive)
        {
            throw new NotImplementedException();
        }
    }
}
