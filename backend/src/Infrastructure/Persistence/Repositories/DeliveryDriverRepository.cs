using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class DeliveryDriverRepository : GenericRepository<DeliveryDriver, Guid>, IDeliveryDriverRepository
    {
        private readonly DbSet<DeliveryDriver> _drivers;
        public DeliveryDriverRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _drivers = dbContext.Set<DeliveryDriver>();
        }

        public async Task<IReadOnlyCollection<DeliveryDriver>> GetByStoreIdAsync(Guid storeId, bool includeInactive = false)
        {
            IQueryable<DeliveryDriver> query = _drivers.Where(d => d.StoreId == storeId);

            // Los repartidores dados de baja se ocultan por defecto: la baja es lógica
            // (`IsActive`) para no perder los pedidos que ya entregó, pero no deben aparecer en la
            // lista de asignación (F7).
            if (!includeInactive)
                query = query.Where(d => d.IsActive);

            return await query.OrderBy(d => d.Name).ToListAsync();
        }
    }
}