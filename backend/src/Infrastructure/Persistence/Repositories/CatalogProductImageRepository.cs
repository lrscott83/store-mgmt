using Domain.Entities.WebCatalog;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class CatalogProductImageRepository : GenericRepository<CatalogProductImage, Guid>, ICatalogProductImageRepository
    {
        public CatalogProductImageRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
        }
    }
}
