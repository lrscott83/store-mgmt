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

        /// <summary>
        /// Actualización PARCIAL de un repartidor: persiste SOLO las columnas de
        /// <paramref name="changedFields"/>, no la fila entera.
        ///
        /// Por qué importa: con <c>Entry.State = Modified</c> el UPDATE escribe todas las columnas,
        /// así que dos PATCH concurrentes —uno corrigiendo el nombre y otro apagando el interruptor—
        /// se pisan: el último guarda los valores que leyó antes. Marcando solo lo que cambia,
        /// cada petición escribe las suyas.
        ///
        /// Lo que esta puerta NO marca nunca: `StoreId`, `TenantId` ni las columnas de auditoría.
        /// La tienda y el tenant son de la fila (el cuerpo no los elige, criterio 2) y la auditoría
        /// la pone el interceptor.
        ///
        /// Se exige una instancia NO rastreada: el contexto es `NoTracking`, así que la fila que
        /// cargan los handlers llega `Detached`. Resetear una entidad ya rastreada descartaría sus
        /// cambios pendientes en silencio. Un conjunto vacío revienta en vez de devolver `true` sin
        /// escribir nada.
        /// </summary>
        Task<bool> UpdatePartialAsync(
            DeliveryDriver driver,
            DeliveryDriverChangedField changedFields,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Campos de <see cref="DeliveryDriver"/> que una operación de ESCRITURA puede mutar. Existen —
    /// en vez de una lista de columnas a mano en el handler— para que el mapeo a nombres de
    /// propiedad de EF viva en un solo sitio (la infraestructura) y añadir un campo sin mapearlo
    /// falle en voz alta en vez de no escribir nada.
    /// </summary>
    [Flags]
    public enum DeliveryDriverChangedField
    {
        None = 0,
        Name = 1,
        Phone = 2,
        IsActive = 4,
    }
}