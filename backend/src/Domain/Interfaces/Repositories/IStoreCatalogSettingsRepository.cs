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
        /// Configuración de la tienda para una LECTURA PÚBLICA (anónimo, sin sesión): salta el
        /// filtro global por tenant del <c>ApplicationDbContext</c>.
        ///
        /// Existe separada de <see cref="GetByStoreIdAsync"/> y no la sustituye, por dos razones
        /// que importan:
        ///
        ///   * El filtro por tenant es lo que confina las lecturas AUTENTICADAS a la tienda del
        ///     contexto. Quitarle el bypass a <see cref="GetByStoreIdAsync"/> abriría esa puerta
        ///     (pedidos, F2), así que el bypass vive en un método aparte y explícito.
        ///   * Una petición anónima NO tiene tenant en el contexto, así que el filtro no puede
        ///     coincidir con ninguna fila: la misma consulta que en sesión devuelve la fila
        ///     devolvería VACÍA sin error ni aviso. Ya lo hacen a propósito
        ///     <c>StoreRepository.GetStoreByCatalogSlugAsync</c> y
        ///     <c>ProductRepository.GetPublishedBy*</c>.
        ///
        /// Seguro por construcción: no devuelve "cualquier configuración" sino la de UN
        /// <c>storeId</c>, y quien lo llama lo resolvió antes por un slug ÚNICO GLOBAL
        /// (<c>GetStoreByCatalogSlugAsync</c>), que es lo que acota el resultado sin sesión.
        /// </summary>
        Task<StoreCatalogSettings?> GetPublicByStoreIdAsync(Guid storeId);

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