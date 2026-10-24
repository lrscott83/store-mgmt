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

        /// <summary>
        /// De una lista de tiendas, cuáles tienen ese módulo ACTIVO. Una sola consulta para toda
        /// la lista (evita el N+1 de preguntar tienda por tienda). Mismo criterio que
        /// <see cref="GetPublicActiveModuleIdsByStoreIdAsync"/>: solo importa `StoreModule.IsActive`.
        /// </summary>
        Task<IReadOnlyCollection<Guid>> GetStoreIdsWithActiveModuleAsync(
            IEnumerable<Guid> storeIds,
            int moduleId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Todas las filas ACTIVAS, de TODAS las tiendas (sin filtro de tenant), para los módulos
        /// indicados. La usa la cascada del catálogo global: al apagar un módulo, sus
        /// <c>StoreModule</c> activos se apagan también (decisión del owner 2026-10-14).
        /// </summary>
        Task<IEnumerable<StoreModule>> GetAllActiveByModuleIdsAsync(IEnumerable<int> moduleIds, CancellationToken cancellationToken = default);
    }
}
