using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductImageRepository : GenericRepository<ProductImage, Guid>, IProductImageRepository
    {
        private readonly DbSet<ProductImage> _productImages;

        public ProductImageRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _productImages = dbContext.Set<ProductImage>();
        }

        public async Task<IList<ProductImage>> GetByProductIdAsync(Guid productId)
        {
            return await _productImages
                .Where(image => image.ProductId == productId)
                .OrderBy(image => image.Order).ThenBy(image => image.CreatedDate)
                .ToListAsync();
        }

        public async Task<ProductImage?> GetByProductAndPathAsync(Guid productId, string path)
        {
            return await _productImages
                .FirstOrDefaultAsync(image => image.ProductId == productId && image.Path == path);
        }
    }
}
