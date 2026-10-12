using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.StoreCatalogImages;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Imágenes del SHOWCASE del catálogo público por tienda: carrusel e imágenes del día.
    ///
    /// Dos conjuntos independientes (decisión del Owner C1), así que las lecturas son POR TIENDA y
    /// traen los dos de una vez, ya ordenados por conjunto: quien publica (el config anónimo) y quien
    /// gestiona (la vista Catálogo Web) necesitan los dos, y separarlos en dos métodos obligaría a
    /// duplicar el filtro por tienda y el bypass público en cada uno.
    /// </summary>
    public interface IStoreCatalogImageRepository : IGenericRepository<StoreCatalogImage, Guid>
    {
        /// <summary>
        /// Imágenes de la tienda para la vista de GESTIÓN, en sesión, ordenadas por conjunto y luego
        /// por <c>OrderIndex</c>. Solo las activas.
        ///
        /// Lectura EN SESIÓN: el filtro global por tenant del <c>ApplicationDbContext</c> es lo que
        /// confina esta lectura a la tienda del contexto.
        /// </summary>
        Task<IList<StoreCatalogImage>> GetByStoreIdAsync(Guid storeId);

        /// <summary>
        /// Imágenes de la tienda para el CATÁLOGO PÚBLICO (anónimo, sin sesión): salta el filtro
        /// global por tenant del <c>ApplicationDbContext</c>. Solo las activas.
        ///
        /// Existe separada de <see cref="GetByStoreIdAsync"/> y no la sustituye por el mismo motivo
        /// que en la configuración del catálogo: el filtro por tenant es lo que confina las lecturas
        /// AUTENTICADAS a la tienda del contexto, y una petición anónima NO tiene tenant, así que la
        /// misma consulta que en sesión devolvería VACÍA — sin error ni aviso — y el storefront nunca
        /// vería un carrusel.
        ///
        /// Seguro por construcción: no devuelve "imágenes de cualquier tienda" sino las de UN
        /// <c>storeId</c>, y quien lo llama lo resolvió antes por un slug ÚNICO GLOBAL.
        /// </summary>
        Task<IList<StoreCatalogImage>> GetPublicByStoreIdAsync(Guid storeId);

        /// <summary>
        /// UNA imagen por id, acotada a la tienda del contexto. Es la lectura que convierte "es de mi
        /// tienda" en una condición de la consulta y no en una promesa: el filtro global solo acota por
        /// TENANT, así que buscar por id dentro de las imágenes de la tienda es lo que impide tocar la
        /// de otra tienda del mismo tenant.
        ///
        /// Devuelve <c>null</c> cuando el id no existe o no es de esa tienda — el llamador lo trata
        /// igual (404), para no revelar si el id existe en otra tienda.
        /// </summary>
        Task<StoreCatalogImage?> GetByIdAndStoreIdAsync(Guid id, Guid storeId, CancellationToken cancellationToken);

        /// <summary>
        /// Toma un lock de transacción por (tienda, conjunto) para serializar las altas concurrentes
        /// al MISMO conjunto. Sin él, dos subidas simultáneas leen el mismo conteo y las dos insertan,
        /// dejando el conjunto por encima del tope.
        ///
        /// Es un lock de PostgreSQL (<c>pg_advisory_xact_lock</c>) que se libera solo al terminar la
        /// transacción abierta por el llamador; no toca datos ni exige una columna nueva. Tiendas o
        /// conjuntos distintos calculan claves distintas y nunca se bloquean entre sí.
        /// </summary>
        Task AcquireSetLockAsync(Guid storeId, StoreCatalogImageKind kind, CancellationToken cancellationToken);

        /// <summary>
        /// Marca SOLO la columna <c>OrderIndex</c> para que el próximo <c>SaveChangesAsync</c> la
        /// escriba. Reordenar no tiene por qué tocar el resto de la fila: un <c>UpdateAsync</c> genérico
        /// marcaría la fila entera como modificada y revertiría un pie de foto o un <c>IsActive</c> que
        /// otro guardó a la vez.
        /// </summary>
        Task<bool> SetOrderIndexAsync(StoreCatalogImage image, int orderIndex);
    }
}