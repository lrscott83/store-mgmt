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
        /// Upsert por IDENTIDAD de la fila. El jugador es el id de la entidad que trae el caller
        /// —cargada de <see cref="GetByStoreIdAsync"/> para editar, o recién creada para el alta.
        ///
        /// <paramref name="modifiedProperties"/> son los nombres de las columnas que el handler
        /// cambió: marcar SOLO esas es lo que impide que "guardar los pedidos" reescriba la marca (y
        /// al revés), porque la fila es UNA (D19) y la comparten dos vistas.
        ///
        /// Sin `modifiedProperties` (llamada histórica de un solo argumento) se conserva el
        /// comportamiento anterior: escribir la fila entera. `exists` es opcional por el mismo
        /// motivo; cuando se omite, se deriva con un `AnyAsync`.
        ///
        /// `EntityState.Unchanged` + `IsModified` por columna NO es opcional para la ruta parcial:
        /// `ApplicationDbContext` es NoTracking, así que una entidad cargada y mutada por el caller
        /// sigue en `Detached` y `SaveChanges` no escribiría NADA — sin excepción y sin aviso.
        /// </summary>
        public async Task<StoreCatalogSettings> UpsertAsync(
            StoreCatalogSettings settings, bool? exists = null, params string[] modifiedProperties)
        {
            bool rowExists = exists ?? await _settings
                .IgnoreQueryFilters()
                .AnyAsync(s => s.Id == settings.Id);

            if (!rowExists)
            {
                settings.CreatedDate = DateTimeOffset.UtcNow;
                return await AddAsync(settings);
            }

            if (modifiedProperties.Length == 0)
            {
                settings.UpdatedDate = DateTimeOffset.UtcNow;
                await UpdateAsync(settings);
                return settings;
            }

            var entry = _dbContext.Entry(settings);
            entry.State = EntityState.Unchanged;
            foreach (string property in modifiedProperties)
                entry.Property(property).IsModified = true;

            return settings;
        }
    }
}