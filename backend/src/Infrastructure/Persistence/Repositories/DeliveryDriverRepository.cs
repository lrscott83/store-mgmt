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

        /// <summary>
        /// Existencia de un repartidor ASIGNABLE (ver el contrato). Una sola consulta `Any`, sin
        /// materializar la plantilla: el `storeId` y el `IsActive` van en el mismo predicado por la
        /// misma razón que en <see cref="GetByStoreIdAsync"/>, para que "de otra tienda", "dado de
        /// baja" y "no existe" no se puedan distinguir desde fuera.
        /// </summary>
        public async Task<bool> ExistsActiveAsync(
            Guid storeId, Guid driverId, CancellationToken cancellationToken = default)
            => await _drivers.AnyAsync(
                d => d.StoreId == storeId && d.Id == driverId && d.IsActive,
                cancellationToken);

        /// <summary>
        /// Escritura PARCIAL (ver el contrato): marca `Unchanged` y luego `IsModified` solo en las
        /// columnas pedidas, así el UPDATE no arrastra tienda, tenant ni auditoría.
        ///
        /// El orden importa: el estado se resetea ANTES de marcar, porque eso es lo que fija el
        /// snapshot de valores originales. Los valores del UPDATE salen del objeto en memoria, no del
        /// snapshot, así que el handler puede mutar la entidad y llamar aquí después.
        /// </summary>
        public Task<bool> UpdatePartialAsync(
            DeliveryDriver driver,
            DeliveryDriverChangedField changedFields,
            CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (changedFields == DeliveryDriverChangedField.None)
                throw new ArgumentException(
                    "A partial delivery-driver update needs at least one changed field.",
                    nameof(changedFields));

            var entry = _dbContext.Entry(driver);
            if (entry.State != EntityState.Detached)
                throw new InvalidOperationException(
                    "The delivery driver is already tracked by this context; resetting it to Unchanged " +
                    "would discard its pending changes. Pass a NoTracking instance, or persist the " +
                    "tracked changes with UpdateAsync.");

            // La validación del conjunto va ANTES de marcar nada, para que un valor no mapeado no
            // deje la entrada medio marcada.
            IReadOnlyList<string> columns = ToColumnNames(changedFields);

            entry.State = EntityState.Unchanged;
            foreach (string column in columns)
                entry.Property(column).IsModified = true;

            return Task.FromResult(true);
        }

        /// <summary>
        /// El ÚNICO mapeo de campo de dominio a propiedad de EF. `nameof` a propósito: renombrar una
        /// propiedad rompe la compilación en vez de romper la escritura en producción. El `throw`
        /// final es la razón de existir del método: un miembro nuevo del enum sin mapear falla en
        /// voz alta en vez de escribirse en silencio o no escribirse.
        /// </summary>
        private static IReadOnlyList<string> ToColumnNames(DeliveryDriverChangedField changedFields)
        {
            const DeliveryDriverChangedField all =
                DeliveryDriverChangedField.Name
                | DeliveryDriverChangedField.Phone
                | DeliveryDriverChangedField.IsActive;

            if ((changedFields & ~all) != 0)
                throw new ArgumentOutOfRangeException(
                    nameof(changedFields), changedFields,
                    "Unmapped delivery-driver field: add it to the partial-update column map.");

            List<string> columns = new(3);

            if (changedFields.HasFlag(DeliveryDriverChangedField.Name))
                columns.Add(nameof(DeliveryDriver.Name));

            if (changedFields.HasFlag(DeliveryDriverChangedField.Phone))
                columns.Add(nameof(DeliveryDriver.Phone));

            if (changedFields.HasFlag(DeliveryDriverChangedField.IsActive))
                columns.Add(nameof(DeliveryDriver.IsActive));

            return columns;
        }
    }
}