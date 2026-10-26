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

        /// <summary>
        /// Agregado de TODAS las tiendas en un rango. Mismas consultas que
        /// <see cref="GetStatsAsync"/> sin el filtro por tienda, más el desglose por tienda que
        /// alimenta el selector: solo se publican las tiendas con al menos una visita, porque el
        /// selector del panel general no debe ofrecer tiendas en cero.
        ///
        /// El trabajo de conteo/agrupación ocurre en la BASE. La única materialización es la serie
        /// diaria `(OccurredAt, SessionHash)`, que no puede agruparse por día en SQL con Npgsql
        /// (mismo motivo documentado arriba) y proyecta solo dos columnas.
        ///
        /// El filtro global por tenant queda ACTIVO: el endpoint es SuperAdmin (lo deja pasar) y
        /// nunca se sirve esta lectura a un rol de tienda.
        /// </summary>
        public async Task<CatalogOverviewSnapshot> GetOverviewStatsAsync(DateTime fromUtc, DateTime toUtc,
            CancellationToken cancellationToken)
        {
            IQueryable<CatalogEvent> query = _events
                .Where(e => e.OccurredAt >= fromUtc && e.OccurredAt <= toUtc);

            int pageViews = await query.CountAsync(e => e.Type == CatalogEventType.PageView, cancellationToken);
            // `SessionHash` y `VisitorHash` incluyen la tienda: el DISTINCT global es exactamente la
            // suma de los DISTINCT por tienda, sin colisión entre tiendas.
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

            var storeRows = await query
                .GroupBy(e => new { e.StoreId, e.Store.Name })
                .Select(group => new
                {
                    group.Key.StoreId,
                    group.Key.Name,
                    Visits = group.Select(e => e.SessionHash).Distinct().Count(),
                })
                .ToListAsync(cancellationToken);

            List<CatalogStoreVisits> stores = storeRows
                .Where(row => row.Visits > 0)
                .Select(row => new CatalogStoreVisits(row.StoreId, row.Name, row.Visits))
                .OrderByDescending(store => store.Visits)
                .ThenBy(store => store.Name)
                .ToList();

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

            return new CatalogOverviewSnapshot(
                new CatalogStatsSnapshot(pageViews, visits, visitors, sources, topProducts, daily),
                stores);
        }
    }
}
