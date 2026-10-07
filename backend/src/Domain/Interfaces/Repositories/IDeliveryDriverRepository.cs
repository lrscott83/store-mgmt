using Domain.Common.Repositories;
using Domain.Entities.DeliveryDrivers;

namespace Domain.Interfaces.Repositories
{
    /// <summary>Repartidores de una tienda (D5, F7).</summary>
    public interface IDeliveryDriverRepository : IGenericRepository<DeliveryDriver, Guid>
    {
        /// <summary>Repartidores de la tienda; `includeInactive` false excluye los dados de baja.</summary>
        Task<IReadOnlyCollection<DeliveryDriver>> GetByStoreIdAsync(Guid storeId, bool includeInactive = false);
    }
}