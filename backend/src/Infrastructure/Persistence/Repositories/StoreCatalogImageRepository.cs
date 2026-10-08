using Domain.Entities.StoreCatalogImages;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreCatalogImageRepository : GenericRepository<StoreCatalogImage, Guid>, IStoreCatalogImageRepository
    {
        private readonly DbSet<StoreCatalogImage> _images;

        public StoreCatalogImageRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _images = dbContext.Set<StoreCatalogImage>();
        }

        /// <summary>
        /// Lectura EN SESIÓN (vista Catálogo Web): el filtro global por tenant se queda, que es lo que
        /// confina la lectura a la tienda del contexto.
        ///
        /// El orden es por conjunto y dentro de él por <c>OrderIndex</c>: quien recibe la lista
        /// publica dos bloques y cada uno sale ya en el orden que eligió el dueño. Reordenar aquí, y
        /// no en cada handler, evita que dos vistas puedan discrepar sobre qué es "la primera
        /// imagen".
        ///
        /// Solo activas: la vista de gestión y el catálogo público tienen que ver exactamente lo
        /// mismo, y una imagen apagada no es "configurada" para ninguno de los dos.
        /// </summary>
        public async Task<IList<StoreCatalogImage>> GetByStoreIdAsync(Guid storeId)
            => await _images
                .Where(image => image.StoreId == storeId && image.IsActive)
                .OrderBy(image => image.Kind)
                .ThenBy(image => image.OrderIndex)
                .ThenBy(image => image.CreatedDate)
                .ToListAsync();

        /// <summary>
        /// Lectura PÚBLICA (catálogo anónimo): `IgnoreQueryFilters` es OBLIGATORIO, no una comodidad.
        ///
        /// `StoreCatalogImage` tiene filtro global `IsSuperAdmin || TenantId == TenantId` (ver
        /// <c>StoreCatalogImageEntityTypeConfiguration</c>) y una petición anónima no tiene tenant en
        /// el contexto: `IsSuperAdmin` es false y `TenantId` es null sobre una columna no nulable, así
        /// que el filtro NO puede coincidir con ninguna fila. Sin este bypass la consulta devolvería
        /// VACÍA — sin error y sin aviso — y el storefront vería siempre los dos conjuntos vacíos
        /// aunque el dueño hubiera subido un carrusel. Es el mismo motivo por el que
        /// <c>StoreCatalogSettingsRepository.GetPublicByStoreIdAsync</c> y
        /// <c>StoreRepository.GetStoreByCatalogSlugAsync</c> saltan el filtro.
        ///
        /// Lo que mantiene acotada la lectura no es el filtro (no hay sesión que acotar) sino el
        /// <c>StoreId</c>: lo resuelve el llamador con un slug único global.
        ///
        /// El orden es el mismo que en la lectura de sesión a propósito: si difirieran, la vista y el
        /// catálogo público mostrarían el carrusel en distinto orden.
        /// </summary>
        public async Task<IList<StoreCatalogImage>> GetPublicByStoreIdAsync(Guid storeId)
            => await _images
                .IgnoreQueryFilters()
                .Where(image => image.StoreId == storeId && image.IsActive)
                .OrderBy(image => image.Kind)
                .ThenBy(image => image.OrderIndex)
                .ThenBy(image => image.CreatedDate)
                .ToListAsync();
    }
}