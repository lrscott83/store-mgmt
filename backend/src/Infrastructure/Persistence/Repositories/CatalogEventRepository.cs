using Domain.Common.Enums;
using Domain.Entities.CatalogEvents;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class CatalogEventRepository : GenericRepository<CatalogEvent, Guid>, ICatalogEventRepository
    {
        private readonly DbSet<CatalogEvent> _events;

        public CatalogEventRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _events = dbContext.Set<CatalogEvent>();
        }

        /// <summary>
        /// Agregado de una tienda en un rango. Proyecta SOLO las columnas que cuentan y agrega en
        /// memoria: el rango lo acota el panel (7/30 días) y así el cálculo no depende de que el
        /// proveedor traduzca `COUNT(DISTINCT ...)` dentro de un `GROUP BY`. `IgnoreQueryFilters`
        /// es deliberado: el endpoint es SuperAdmin y el aislamiento lo da el `storeId`, no el
        /// tenant del contexto.
        /// </summary>
        public async Task<CatalogStatsSnapshot> GetStatsAsync(Guid storeId, DateTime fromUtc, DateTime toUtc,
            CancellationToken cancellationToken)
        {
            var rows = await _events
                .IgnoreQueryFilters()
                .Where(e => e.StoreId == storeId && e.OccurredAt >= fromUtc && e.OccurredAt <= toUtc)
                .Select(e => new
                {
                    e.Type,
                    e.VisitorHash,
                    e.SessionHash,
                    e.Source,
                    e.OccurredAt,
                    e.ProductId,
                })
                .ToListAsync(cancellationToken);

            int pageViews = rows.Count(row => row.Type == CatalogEventType.PageView);
            int visits = rows.Select(row => row.SessionHash).Distinct().Count();
            int visitors = rows.Select(row => row.VisitorHash).Distinct().Count();

            List<CatalogSourceVisits> sources = rows
                .GroupBy(row => row.Source)
                .Select(group => new CatalogSourceVisits(
                    group.Key,
                    group.Select(row => row.SessionHash).Distinct().Count()))
                .OrderByDescending(source => source.Visits)
                .ToList();

            List<CatalogDayVisits> daily = rows
                .GroupBy(row => row.OccurredAt.Date)
                .Select(group => new CatalogDayVisits(
                    group.Key,
                    group.Select(row => row.SessionHash).Distinct().Count()))
                .OrderBy(day => day.Day)
                .ToList();

            List<CatalogProductViews> topProducts = rows
                .Where(row => row.Type == CatalogEventType.ProductView && row.ProductId.HasValue)
                .GroupBy(row => row.ProductId!.Value)
                .Select(group => new CatalogProductViews(group.Key, group.Count()))
                .OrderByDescending(product => product.Views)
                .ThenBy(product => product.ProductId)
                .Take(5)
                .ToList();

            return new CatalogStatsSnapshot(pageViews, visits, visitors, sources, topProducts, daily);
        }
    }
}
