using Domain.Common.Repositories;
using Domain.Entities.Products;

namespace Domain.Interfaces.Repositories
{
    public interface IProductRepository : IGenericRepository<Product, Guid>
    {
        
    }
}
