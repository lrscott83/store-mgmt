using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreCatalogSettingsRepository : GenericRepository<StoreCatalogSettings, Guid>, IStoreCatalogSettingsRepository
    {
        private readonly DbSet<StoreCatalogSettings> _settings;
        public StoreCatalogSettingsRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _settings = dbContext.Set<StoreCatalogSettings>();
        }

        /// <summary>
        /// Lectura EN SESIÓN (pedidos, F2): el filtro global por tenant se queda, que es lo que
        /// confina la lectura a la tienda del contexto.
        /// </summary>
        public async Task<StoreCatalogSettings?> GetByStoreIdAsync(Guid storeId)
            => await _settings.FirstOrDefaultAsync(s => s.StoreId == storeId);

        /// <summary>
        /// Lectura PÚBLICA (catálogo de una tienda sin sesión): `IgnoreQueryFilters` es
        /// OBLIGATORIO, no una comodidad.
        ///
        /// `StoreCatalogSettings` tiene filtro global `IsSuperAdmin || TenantId == TenantId`
        /// (ver <c>StoreCatalogSettingsEntityTypeConfiguration</c>) y una petición anónima no tiene
        /// tenant en el contexto: `IsSuperAdmin` es false y `TenantId` es null sobre una columna no
        /// nulable, así que el filtro NO puede coincidir con ninguna fila. Sin este bypass la
        /// consulta devolvería VACÍA — sin error y sin aviso — y el storefront vería
        /// `Enabled = false` para siempre aunque el dueño hubiera abierto los pedidos. Es el mismo
        /// motivo por el que <c>StoreRepository.GetStoreByCatalogSlugAsync</c> y
        /// <c>ProductRepository.GetPublishedBy*</c> saltan el filtro.
        ///
        /// Lo que mantiene acotada la lectura no es el filtro (no hay sesión que acotar) sino el
        /// `StoreId`: lo resuelve el llamador con un slug único global, y el índice único de
        /// `StoreId` garantiza una sola fila por tienda.
        /// </summary>
        public async Task<StoreCatalogSettings?> GetPublicByStoreIdAsync(Guid storeId)
            => await _settings
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.StoreId == storeId);

        /// <summary>
        /// Upsert por IDENTIDAD de la fila: si ese id ya existe la marca como modificada, y si no
        /// la inserta. El jugador es el id de la entidad que trae el caller — cargada de
        /// <see cref="GetByStoreIdAsync"/> para editar, o recién creada con id nuevo para dar de alta
        /// la primera vez.
        ///
        /// `EntityState.Modified` NO es opcional: `ApplicationDbContext` es NoTracking, así que una
        /// entidad cargada y mutada por el caller seguiría en `Detached` y `SaveChanges` no escribiría
        /// NADA — sin excepción y sin aviso. Marcar la entidad convierte la mutación en un UPDATE
        /// de verdad; sin marca, un upsert "silenciosamente no hace nada".
        ///
        /// `IgnoreQueryFilters` en la existencia: la fila podría estar de baja lógica (IsActive=false)
        /// y reactivarla es un UPDATE legítimo, no un alta nueva.
        /// </summary>
        public async Task<StoreCatalogSettings> UpsertAsync(StoreCatalogSettings settings)
        {
            bool exists = await _settings
                .IgnoreQueryFilters()
                .AnyAsync(s => s.Id == settings.Id);

            if (exists)
            {
                settings.UpdatedDate = DateTimeOffset.UtcNow;
                await UpdateAsync(settings);
                return settings;
            }

            settings.CreatedDate = DateTimeOffset.UtcNow;
            return await AddAsync(settings);
        }
    }
}