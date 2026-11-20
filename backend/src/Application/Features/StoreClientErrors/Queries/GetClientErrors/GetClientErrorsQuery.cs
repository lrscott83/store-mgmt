using Application.Abstractions.Messaging;
using Application.Dtos.StoreClientErrors;

namespace Application.Features.StoreClientErrors.Queries.GetClientErrors
{
    /// <summary>
    /// Límites documentados de la paginación del panel SuperAdmin (spec S6). Viven fuera del
    /// record porque un valor por defecto sí puede referenciar una constante de otro tipo, pero no
    /// una declarada en el mismo tipo.
    /// </summary>
    public static class StoreClientErrorsPagination
    {
        /// <summary>Tamaño de página por defecto de la pantalla.</summary>
        public const int Default = 50;

        /// <summary>
        /// Máximo documentado de `pageSize`. Un valor mayor se recorta a este: la pantalla nunca
        /// debe romperse por pedir de más.
        /// </summary>
        public const int MaxPageSize = 200;

        /// <summary>
        /// Máximo documentado de `page`. Un valor mayor se recorta a este. Sin tope, el desplazamiento
        /// `(page - 1) * pageSize` del repositorio desborda un `int` y PostgreSQL acaba recibiendo un
        /// OFFSET negativo. Con `MaxPageSize = 200` el desplazamiento máximo es 1 999 800.
        /// </summary>
        public const int MaxPage = 10_000;
    }

    /// <summary>
    /// Conversión de las cotas del filtro de fechas a UTC (spec S7). El cliente manda instantes
    /// absolutos, pero el binder puede entregarlos con cualquier <see cref="DateTimeKind"/>; una
    /// comparación contra la columna `timestamp with time zone` exige `Kind=Utc`.
    ///
    /// NO se reetiqueta: reetiquetar conserva la hora de pared y desplaza la frontera del filtro
    /// cuando la entrada viene en local. Un valor `Local` se CONVIERTE a su instante universal, y
    /// uno `Unspecified` se interpreta como UTC, que es lo que describe el contrato del cliente.
    /// </summary>
    public static class StoreClientErrorsDateBounds
    {
        /// <summary>El mismo instante, con `Kind=Utc`, sin mover el reloj en los casos ambiguos.</summary>
        public static DateTime ToUtc(DateTime value) => value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
    }

    /// <summary>
    /// Lectura filtrada de los errores del cliente POS para la pantalla SuperAdmin
    /// (`pos-client-error-logs`, specs S6 y S7). Todos los filtros son opcionales y combinables.
    /// </summary>
    /// <param name="OwnerId">Solo los errores de las tiendas de ese owner.</param>
    /// <param name="StoreId">Solo los errores de esa tienda.</param>
    /// <param name="From">Cota inferior INCLUSIVA sobre `OccurredAt` (instante absoluto UTC).</param>
    /// <param name="To">Cota superior INCLUSIVA sobre `OccurredAt` (instante absoluto UTC).</param>
    /// <param name="Page">Página pedida; se recorta a [1, `StoreClientErrorsPagination.MaxPage`].</param>
    /// <param name="PageSize">Tamaño de página; se recorta a [`1`, `StoreClientErrorsPagination.MaxPageSize`].</param>
    public sealed record GetClientErrorsQuery(Guid? OwnerId = null,
        Guid? StoreId = null,
        DateTime? From = null,
        DateTime? To = null,
        int Page = 1,
        int PageSize = StoreClientErrorsPagination.Default) : IQuery<StoreClientErrorsPageDto>;
}
