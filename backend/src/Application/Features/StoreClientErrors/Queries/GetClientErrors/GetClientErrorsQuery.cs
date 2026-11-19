using Application.Abstractions.Messaging;
using Application.Dtos.StoreClientErrors;

namespace Application.Features.StoreClientErrors.Queries.GetClientErrors
{
    /// <summary>
    /// Límites documentados de la paginación del panel SuperAdmin (spec S6). Viven fuera del
    /// record porque un valor por defecto sí puede referenciar una constante de otro tipo, pero no
    /// una declarada en el mismo tipo.
    /// </summary>
    public static class StoreClientErrorsPageSize
    {
        /// <summary>Tamaño de página por defecto de la pantalla.</summary>
        public const int Default = 50;

        /// <summary>
        /// Máximo documentado. Un `pageSize` mayor se recorta a este valor en vez de rechazarse:
        /// la pantalla nunca debe romperse por pedir de más.
        /// </summary>
        public const int Max = 200;
    }

    /// <summary>
    /// Lectura filtrada de los errores del cliente POS para la pantalla SuperAdmin
    /// (`pos-client-error-logs`, specs S6 y S7). Todos los filtros son opcionales y combinables.
    /// </summary>
    /// <param name="OwnerId">Solo los errores de las tiendas de ese owner.</param>
    /// <param name="StoreId">Solo los errores de esa tienda.</param>
    /// <param name="From">Cota inferior INCLUSIVA sobre `OccurredAt` (instante absoluto UTC).</param>
    /// <param name="To">Cota superior INCLUSIVA sobre `OccurredAt` (instante absoluto UTC).</param>
    /// <param name="Page">Página pedida; se recorta a >= 1.</param>
    /// <param name="PageSize">Tamaño de página; se recorta a `StoreClientErrorsPageSize.Max`.</param>
    public sealed record GetClientErrorsQuery(Guid? OwnerId = null,
        Guid? StoreId = null,
        DateTime? From = null,
        DateTime? To = null,
        int Page = 1,
        int PageSize = StoreClientErrorsPageSize.Default) : IQuery<StoreClientErrorsPageDto>;
}
