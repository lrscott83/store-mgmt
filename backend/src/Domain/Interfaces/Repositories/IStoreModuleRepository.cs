using Domain.Common.Repositories;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;

namespace Domain.Interfaces.Repositories
{
    public interface IStoreModuleRepository : IGenericRepository<StoreModule>
    {
        Task<IEnumerable<Module>> GetAvailableModulesByStoreIdAsync(Guid storeId);
        Task<IEnumerable<StoreModule>> GetStoreModulesByIdAsync(Guid storeId);

        /// <summary>
        /// IDs de los módulos ACTIVOS de la tienda, por la vía ANÓNIMA (catálogo público y alta de
        /// pedido). Solo se lee si <c>StoreModule.IsActive</c>: un módulo desactivado es "la tienda
        /// dejó de ofrecer esto", y es exactamente lo que el gating de módulos tiene que ver.
        ///
        /// Devuelve los <c>ModuleId</c> (ints de <c>Domain.Common.Enums.ModuleType</c>), no las
        /// entidades: el gating solo necesita la pregunta "¿este módulo está activo?".
        /// </summary>
        Task<IReadOnlyCollection<int>> GetPublicActiveModuleIdsByStoreIdAsync(Guid storeId);
    }
}
