using Domain.Common.Repositories;
using Domain.Entities.StoreClientErrors;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Errores del cliente POS publicados al backend (spec S5 de `pos-client-error-logs`). Es una
    /// tabla append-only: el POS solo escribe; la lectura filtrada es la del panel SuperAdmin
    /// (T3, specs S6 y S7).
    /// </summary>
    public interface IStoreClientErrorRepository : IGenericRepository<StoreClientError, Guid>
    {
        /// <summary>
        /// Una página ya unida con los nombres de owner y tienda (`Store → Owner → User.FullName`),
        /// ordenada por `OccurredAt` DESC con desempate por `ReceivedAt` DESC.
        /// <para>
        /// El rango es INCLUSIVO en ambos extremos y compara contra `OccurredAt` (S7), no contra
        /// `ReceivedAt`. `Page` y `PageSize` llegan YA recortados por el handler.
        /// </para>
        /// </summary>
        Task<StoreClientErrorsPage> GetPageAsync(StoreClientErrorsFilter filter,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Filtros del panel. Todos opcionales y combinables; `null` significa "sin restricción".
    /// </summary>
    public sealed record StoreClientErrorsFilter(
        Guid? OwnerId,
        Guid? StoreId,
        DateTime? From,
        DateTime? To,
        int Page,
        int PageSize);

    /// <summary>
    /// Una fila del panel con los nombres YA resueltos por JOIN. `OwnerName` y `StoreName` son
    /// NULL cuando la fila no tiene tienda (spec S4) — nunca se inventa un nombre.
    /// </summary>
    public sealed record StoreClientErrorRow(
        Guid Id,
        Guid? StoreId,
        string? OwnerName,
        string? StoreName,
        string Message,
        string? Route,
        string? Location,
        int Count,
        string? Context,
        string? AppVersion,
        string? Device,
        DateTime OccurredAt,
        DateTime ReceivedAt);

    /// <summary>
    /// Una página de filas más el total del filtro completo (COUNT en la base, nunca limitado por
    /// el tamaño de página).
    /// </summary>
    public sealed record StoreClientErrorsPage(
        IReadOnlyList<StoreClientErrorRow> Items,
        int TotalCount);
}
