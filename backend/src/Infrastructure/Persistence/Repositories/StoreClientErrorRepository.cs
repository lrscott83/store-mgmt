using Domain.Entities.StoreClientErrors;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreClientErrorRepository : GenericRepository<StoreClientError, Guid>, IStoreClientErrorRepository
    {
        private readonly DbSet<StoreClientError> _storeClientErrors;

        public StoreClientErrorRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storeClientErrors = dbContext.Set<StoreClientError>();
        }

        /// <summary>
        /// Una página del panel SuperAdmin (specs S6 y S7). Un solo SELECT para las filas (los
        /// nombres salen del JOIN Store → Owner → User, sin desnormalizar y sin N+1) y un COUNT
        /// aparte sobre el filtro COMPLETO, que el tamaño de página nunca recorta.
        ///
        /// El JOIN es LEFT: una fila sin tienda (spec S4) sigue apareciendo, con los dos nombres en
        /// NULL. `StoreId` filtra por la tienda de la fila y `OwnerId` por el owner de esa tienda.
        ///
        /// El rango de fechas es INCLUSIVO en ambos extremos y compara `OccurredAt`, el instante del
        /// cliente (S7) — no `ReceivedAt`, la llegada al servidor. Npgsql rechaza un
        /// `timestamp with time zone` con `Kind` distinto de UTC, así que las cotas se normalizan
        /// aquí: el cliente manda instantes absolutos y el binder puede entregarlos sin `Kind`.
        /// </summary>
        public async Task<StoreClientErrorsPage> GetPageAsync(StoreClientErrorsFilter filter,
            CancellationToken cancellationToken = default)
        {
            IQueryable<StoreClientError> query = _storeClientErrors.AsNoTracking();

            if (filter.OwnerId is { } ownerId)
                query = query.Where(e => e.Store != null && e.Store.OwnerId == ownerId);

            if (filter.StoreId is { } storeId)
                query = query.Where(e => e.StoreId == storeId);

            if (filter.From is { } from)
            {
                DateTime fromUtc = DateTime.SpecifyKind(from, DateTimeKind.Utc);
                query = query.Where(e => e.OccurredAt >= fromUtc);
            }

            if (filter.To is { } to)
            {
                DateTime toUtc = DateTime.SpecifyKind(to, DateTimeKind.Utc);
                query = query.Where(e => e.OccurredAt <= toUtc);
            }

            int totalCount = await query.CountAsync(cancellationToken);

            List<StoreClientErrorRow> items = await query
                .OrderByDescending(e => e.OccurredAt)
                .ThenByDescending(e => e.ReceivedAt)
                .Skip((filter.Page - 1) * filter.PageSize)
                .Take(filter.PageSize)
                .Select(e => new StoreClientErrorRow(
                    e.Id,
                    e.StoreId,
                    e.Store != null ? e.Store.Owner.User.FullName : null,
                    e.Store != null ? e.Store.Name : null,
                    e.Message,
                    e.Route,
                    e.Location,
                    e.Count,
                    e.Context,
                    e.AppVersion,
                    e.Device,
                    e.OccurredAt,
                    e.ReceivedAt))
                .ToListAsync(cancellationToken);

            return new StoreClientErrorsPage(items, totalCount);
        }
    }
}
