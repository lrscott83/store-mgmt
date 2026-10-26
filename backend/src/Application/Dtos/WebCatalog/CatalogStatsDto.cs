using Domain.Common.Enums;

namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Estadísticas del catálogo de UNA tienda para el panel del SuperAdmin. Es una lectura
    /// agregada, no un listado de eventos.
    /// </summary>
    public sealed class CatalogStatsDto
    {
        /// <summary>Ventana consultada, en días.</summary>
        public int Days { get; init; }

        /// <summary>Visitas (sesiones distintas de 30 minutos).</summary>
        public int Visits { get; init; }

        /// <summary>Visitantes únicos del periodo (huella diaria distinta por día).</summary>
        public int Visitors { get; init; }

        /// <summary>Páginas vistas del catálogo.</summary>
        public int PageViews { get; init; }

        /// <summary>Pedidos online (OrderType.WhatsApp) creados en el periodo.</summary>
        public int Orders { get; init; }

        /// <summary>Pedidos / visitas. 0 cuando no hubo visitas.</summary>
        public double ConversionRate { get; init; }

        public IReadOnlyList<CatalogSourceStatsDto> Sources { get; init; } = [];

        public IReadOnlyList<CatalogProductStatsDto> TopProducts { get; init; } = [];

        public IReadOnlyList<CatalogDayStatsDto> Daily { get; init; } = [];
    }

    public sealed record CatalogSourceStatsDto(CatalogSource Source, int Visits);

    public sealed record CatalogProductStatsDto(Guid ProductId, string Name, int Views);

    public sealed record CatalogDayStatsDto(DateTime Day, int Visits);

    /// <summary>
    /// Panel GENERAL del catálogo: el mismo contrato de una tienda agregado para todas
    /// (`Totals`), más la lista de tiendas con visitas en el periodo (la que alimenta el selector).
    /// Composición en vez de herencia porque `CatalogStatsDto` es la forma cerrada de una tienda.
    /// </summary>
    public sealed class CatalogStatsOverviewDto
    {
        public CatalogStatsDto Totals { get; init; } = new();

        /// <summary>Solo tiendas con visitas en el periodo, ordenadas por visitas descendente.</summary>
        public IReadOnlyList<CatalogStoreStatsDto> Stores { get; init; } = [];
    }

    public sealed record CatalogStoreStatsDto(Guid StoreId, string Name, int Visits);
}
