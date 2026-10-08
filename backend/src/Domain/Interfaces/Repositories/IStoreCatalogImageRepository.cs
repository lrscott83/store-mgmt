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
    }
}