using Domain.Entities.SiteTelemetry;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;

namespace Infrastructure.Persistence.Repositories
{
    public class SiteEventRepository : GenericRepository<SiteEvent, Guid>, ISiteEventRepository
    {
        public SiteEventRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
        }
    }
}
