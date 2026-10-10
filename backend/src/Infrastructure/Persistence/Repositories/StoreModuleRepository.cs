using AutoMapper.Features;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreModuleRepository : GenericRepository<StoreModule>, IStoreModuleRepository
    {
        private readonly DbSet<StoreModule> _storeModules;
        public StoreModuleRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storeModules = dbContext.Set<StoreModule>();
        }

        public async Task<IEnumerable<Module>> GetAvailableModulesByStoreIdAsync(Guid storeId)
        {
            return await _storeModules
                .Where(sm => sm.IsActive && sm.Module.IsActive && sm.Module.AvailableToStore
                    && sm.Module.Features.Any(f => f.IsActive && f.AvailableToStore)
                    && sm.Store.IsActive && sm.Store.Owner.IsActive && sm.StoreId == storeId)
                .OrderBy(sm => sm.Module.Order)
                .Select(sm => sm.Module)
                .ToListAsync();
        }

        public async Task<IEnumerable<StoreModule>> GetStoreModulesByIdAsync(Guid storeId)
        {
            return await _storeModules
                .Include(sm => sm.Module)
                .Where(sm => sm.StoreId == storeId)
                .ToListAsync();
        }

        /// <summary>
        /// Lectura PÚBLICA de los módulos ACTIVOS de la tienda: `IgnoreQueryFilters` es
        /// OBLIGATORIO, no una comodidad.
        ///
        /// `StoreModule` tiene filtro global `IsSuperAdmin || TenantId == TenantId` (ver
        /// <c>StoreModuleEntityTypeConfiguration</c>) y una petición ANÓNIMA no tiene tenant en el
        /// contexto: `IsSuperAdmin` es false y el `TenantId` del contexto es null sobre una columna
        /// no nulable, así que el filtro NO puede coincidir con ninguna fila. Sin este bypass la
        /// consulta devolvería VACÍA — sin error y sin aviso — y el gating se leería como
        /// "ningún módulo activo" siempre, aunque el dueño hubiera comprado el módulo. Es el mismo
        /// motivo por el que <c>StoreCatalogSettingsRepository.GetPublicByStoreIdAsync</c>,
        /// <c>StoreCatalogImageRepository.GetPublicByStoreIdAsync</c> y
        /// <c>StoreRepository.GetStoreByCatalogSlugAsync</c> saltan el filtro.
        ///
        /// Lo que mantiene acotada la lectura no es el filtro (no hay sesión que acotar) sino el
        /// `StoreId`: lo resuelve el llamador con un slug único global, y el índice único de
        /// <c>(StoreId, ModuleId)</c> garantiza una sola fila por módulo de tienda.
        ///
        /// NO se filtra por <c>Module.IsActive</c> ni por <c>Module.AvailableToStore</c>: el gating
        /// responde "¿la TIENDA tiene este módulo activo?", que es la fila de <c>StoreModule</c>, no
        /// "qué puede ofrecer el catálogo". Exigir el catálogo entero
        /// (<see cref="GetAvailableModulesByStoreIdAsync"/>) para esta pregunta convertiría un
        /// booleano en un fallo silencioso el día que una tienda tenga un módulo activo que no
        /// cumple alguna de esas condiciones.
        /// </summary>
        public async Task<IReadOnlyCollection<int>> GetPublicActiveModuleIdsByStoreIdAsync(Guid storeId)
        {
            return await _storeModules
                .IgnoreQueryFilters()
                .Where(sm => sm.StoreId == storeId && sm.IsActive)
                .Select(sm => sm.ModuleId)
                .Distinct()
                .ToListAsync();
        }
    }
}
