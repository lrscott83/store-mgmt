using Domain.Common.Repositories;
using Domain.Entities.StoreCatalogSettings;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Configuración del catálogo web por tienda (F1 pedidos + F8 marca).
    ///
    /// Una fila por tienda (D7), así que la lectura natural es por `StoreId` y no por id.
    /// </summary>
    public interface IStoreCatalogSettingsRepository : IGenericRepository<StoreCatalogSettings, Guid>
    {
        /// <summary>Configuración de la tienda; null si la tienda todavía no tiene fila.</summary>
        Task<StoreCatalogSettings?> GetByStoreIdAsync(Guid storeId);

        /// <summary>
        /// Guarda la configuración de la tienda: si ya existe su fila la ACTUALIZA y si no, la
        /// inserta. Es un upsert explícito porque el editor de F1 manda la fila completa y la
        /// tienda puede no tener ninguna todavía.
        ///
        /// OJO (`ApplicationDbContext` es NoTracking): actualizar una entidad CARGADA sin
        /// `Update`/`EntityState.Modified` no escribe NADA — ni error, ni aviso. Por eso el
        /// upsert marca la entidad explícitamente en vez de confiar en el change tracker.
        /// </summary>
        Task<StoreCatalogSettings> UpsertAsync(StoreCatalogSettings settings);
    }
}