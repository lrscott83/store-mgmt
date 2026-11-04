using Domain.Common.Repositories;
using Domain.Entities.DeliveryDrivers;

namespace Domain.Interfaces.Repositories
{
    /// <summary>Repartidores de una tienda (D5, F7).</summary>
    public interface IDeliveryDriverRepository : IGenericRepository<DeliveryDriver, Guid>
    {
        /// <summary>Repartidores de la tienda; `includeInactive` false excluye los dados de baja.</summary>
        Task<IReadOnlyCollection<DeliveryDriver>> GetByStoreIdAsync(Guid storeId, bool includeInactive = false);

        /// <summary>
        /// ¿Es <paramref name="driverId"/> un repartidor ASIGNABLE de <paramref name="storeId"/>?
        ///
        /// Una consulta de existencia y no la plantilla completa: al asignar un pedido solo hace
        /// falta la respuesta, y materializar la lista para preguntar `Any(d => d.Id == driverId)`
        /// trae N filas —con nombre y teléfono— para usar una.
        ///
        /// Conserva EXACTAMENTE las tres condiciones de <see cref="GetByStoreIdAsync"/> sin
        /// `includeInactive`: misma tienda, id igual, y `IsActive` (la baja es lógica, y un
        /// repartidor dado de baja no puede recibir pedidos nuevos aunque los que ya entregó
        /// conserven su referencia). Al no distinguir el motivo, "no existe", "es de otra tienda" e
        /// "inactivo" son la misma respuesta, que es lo que impide usar el endpoint como oráculo de
        /// ids ajenos (criterio 7).
        /// </summary>
        Task<bool> ExistsActiveAsync(
            Guid storeId, Guid driverId, CancellationToken cancellationToken = default);
    }
}