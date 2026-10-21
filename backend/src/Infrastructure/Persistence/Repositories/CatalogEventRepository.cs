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
        /// Agregado de una tienda en un rango. El trabajo de conteo/agrupación ocurre en la BASE:
        /// traer la ventana entera y agregar en memoria convertía un panel SuperAdmin en una
        /// lectura sin cota de la tabla de eventos. El filtro global por tenant queda ACTIVO: el
        /// endpoint es SuperAdmin y el `storeId` sigue siendo el aislamiento explícito.
        /// </summary>
        public async Task<CatalogStatsSnapshot> GetStatsAsync(Guid storeId, DateTime fromUtc, DateTime toUtc,
            CancellationToken cancellationToken)
        {
            IQueryable<CatalogEvent> query = _events
                .Where(e => e.StoreId == storeId && e.OccurredAt >= fromUtc && e.OccurredAt <= toUtc);

            int pageViews = await query.CountAsync(e => e.Type == CatalogEventType.PageView, cancellationToken);
            int visits = await query.Select(e => e.SessionHash).Distinct().CountAsync(cancellationToken);
            int visitors = await query.Select(e => e.VisitorHash).Distinct().CountAsync(cancellationToken);

            var sourceRows = await query
                .GroupBy(e => e.Source)
                .Select(group => new
                {
                    Source = group.Key,
                    Visits = group.Select(e => e.SessionHash).Distinct().Count(),
                })
                .ToListAsync(cancellationToken);

            List<CatalogSourceVisits> sources = sourceRows
                .Select(row => new CatalogSourceVisits(row.Source, row.Visits))
                .OrderByDescending(source => source.Visits)
                .ToList();

            // `GroupBy(e => e.OccurredAt.Date)` sobre `timestamp with time zone` no se traduce en
            // Npgsql (date_trunc de 3 argumentos). Se proyectan solo las dos columnas necesarias y
            // se agrupa en memoria: no se materializa la fila completa del evento.
            var dailyRows = await query
                .Select(e => new { e.OccurredAt, e.SessionHash })
                .ToListAsync(cancellationToken);

            List<CatalogDayVisits> daily = dailyRows
                .GroupBy(row => row.OccurredAt.Date)
                .Select(group => new CatalogDayVisits(
                    group.Key,
                    group.Select(row => row.SessionHash).Distinct().Count()))
                .OrderBy(day => day.Day)
                .ToList();

            var productRows = await query
                .Where(e => e.Type == CatalogEventType.ProductView && e.ProductId != null)
                .GroupBy(e => e.ProductId!.Value)
                .Select(group => new
                {
                    ProductId = group.Key,
                    Views = group.Count(),
                })
                .OrderByDescending(row => row.Views)
                .ThenBy(row => row.ProductId)
                .Take(5)
                .ToListAsync(cancellationToken);

            List<CatalogProductViews> topProducts = productRows
                .Select(row => new CatalogProductViews(row.ProductId, row.Views))
                .ToList();

            return new CatalogStatsSnapshot(pageViews, visits, visitors, sources, topProducts, daily);
        }
    }
}
