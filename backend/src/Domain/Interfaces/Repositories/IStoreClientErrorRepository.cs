using Domain.Common.Repositories;
using Domain.Entities.StoreClientErrors;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Errores del cliente POS publicados al backend (spec S5 de `pos-client-error-logs`). Es una
    /// tabla append-only: el POS solo escribe, y la lectura filtrada del panel SuperAdmin (T3) aún
    /// no existe, así que no expone consultas propias.
    /// </summary>
    public interface IStoreClientErrorRepository : IGenericRepository<StoreClientError, Guid>
    {
    }
}
