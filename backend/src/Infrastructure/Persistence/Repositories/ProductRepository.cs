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
    }
}
